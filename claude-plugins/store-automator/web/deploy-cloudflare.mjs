#!/usr/bin/env node
/**
 * Deploy web pages to Cloudflare Pages.
 *
 * Usage: node deploy-cloudflare.mjs <project-dir> [--project-name NAME]
 *
 * Reads configuration from ci.config.yaml in project-dir.
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 * (or reads from .mcp.json in project-dir).
 *
 * Steps:
 *   1. Read Cloudflare credentials from env or .mcp.json
 *   2. Create Cloudflare Pages project if it does not exist
 *   3. Fill template variables in HTML/CSS from ci.config.yaml
 *   4. Upload files as a new deployment
 *   5. Output the live URL
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { request } from "node:https";

const args = process.argv.slice(2);
const projectDir = args[0] || process.cwd();
let projectName = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--project-name" && args[i + 1]) {
    projectName = args[i + 1];
  }
}

const CONFIG_KEYS = {
  APP_NAME: "name",
  BUNDLE_ID: "bundle_id",
  COMPANY_NAME: "company_name",
  CONTACT_EMAIL: "contact_email",
  SUPPORT_EMAIL: "support_email",
  TAGLINE: "tagline",
  PRIMARY_COLOR: "primary_color",
  SECONDARY_COLOR: "secondary_color",
  APP_STORE_URL: "app_store_url",
  GOOGLE_PLAY_URL: "google_play_url",
  DOMAIN: "domain",
  JURISDICTION: "jurisdiction",
};

function extractYamlValue(raw, yamlKey) {
  const escaped = yamlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}:\\s*["']?([^"'\\n]+)`);
  const match = raw.match(pattern);
  return match ? match[1].replace(/^["']|["']$/g, "") : "";
}

function loadConfig(dir) {
  const configPath = join(dir, "ci.config.yaml");
  if (!existsSync(configPath)) {
    console.error(`ERROR: ci.config.yaml not found in ${dir}`);
    process.exit(1);
  }
  const raw = readFileSync(configPath, "utf8");
  const vars = {};
  for (const [varName, yamlKey] of Object.entries(CONFIG_KEYS)) {
    const value = extractYamlValue(raw, yamlKey);
    if (value) vars[varName] = value;
  }
  if (!projectName) {
    const pn = extractYamlValue(raw, "cloudflare_project_name");
    if (pn) projectName = pn;
  }
  vars.CURRENT_YEAR = new Date().getFullYear().toString();
  vars.LAST_UPDATED = new Date().toISOString().split("T")[0];
  return vars;
}

function getCredentials(dir) {
  let token = process.env.CLOUDFLARE_API_TOKEN || "";
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  if (!token || !accountId) {
    const mcpPath = join(dir, ".mcp.json");
    if (existsSync(mcpPath)) {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
      const cfServer = mcp?.mcpServers?.cloudflare || {};
      const cfEnv = cfServer.env || {};
      const cfArgs = cfServer.args || [];
      token = token || cfEnv.CLOUDFLARE_API_TOKEN || "";
      if (!accountId && cfArgs.length >= 4) {
        const runIdx = cfArgs.indexOf("run");
        if (runIdx >= 0 && cfArgs[runIdx + 1]) {
          accountId = cfArgs[runIdx + 1];
        }
      }
      accountId = accountId || cfEnv.CLOUDFLARE_ACCOUNT_ID || "";
    }
  }
  if (!token || !accountId) {
    console.error("ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required");
    process.exit(1);
  }
  return { token, accountId };
}

function httpsRequest(opts, payload) {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(payload);
    if (payload) {
      opts.headers["Content-Length"] = isBuffer
        ? payload.length
        : Buffer.byteLength(payload);
    }
    const req = request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cfApi(method, path, token, body) {
  const payload = body ? JSON.stringify(body) : null;
  return httpsRequest({
    hostname: "api.cloudflare.com",
    path,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }, payload);
}

function fillTemplateVars(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`\${${key}}`, value || "");
  }
  return result;
}

function collectWebFiles(dir, vars) {
  const webDir = join(dir, "web");
  const sourceDir = existsSync(webDir) ? webDir : dir;
  const textExts = new Set([".html", ".css", ".js", ".mjs", ".json"]);
  const binaryExts = new Set([".png", ".jpg", ".svg", ".ico"]);
  const files = [];
  for (const name of readdirSync(sourceDir)) {
    if (name === "deploy-cloudflare.mjs") continue;
    const ext = extname(name).toLowerCase();
    const isText = textExts.has(ext);
    if (!isText && !binaryExts.has(ext)) continue;
    const filePath = join(sourceDir, name);
    const content = isText
      ? fillTemplateVars(readFileSync(filePath, "utf8"), vars)
      : readFileSync(filePath);
    files.push({ name: `/${name}`, content });
  }
  return files;
}

async function ensureProject(accountId, token, name) {
  const listPath = `/client/v4/accounts/${accountId}/pages/projects/${name}`;
  const existing = await cfApi("GET", listPath, token);
  if (existing.status === 200 && existing.data?.success) {
    console.log(`Project "${name}" exists`);
    return;
  }
  console.log(`Creating project "${name}"...`);
  const createPath = `/client/v4/accounts/${accountId}/pages/projects`;
  const resp = await cfApi("POST", createPath, token, {
    name,
    production_branch: "main",
  });
  if (!resp.data?.success) {
    console.error("Failed to create project:", JSON.stringify(resp.data));
    process.exit(1);
  }
  console.log(`Project "${name}" created`);
}

async function createDeployment(accountId, token, name, files) {
  const boundary = "----FormBoundary" + Date.now().toString(36);
  const buffers = [];
  for (const file of files) {
    const isText = typeof file.content === "string";
    const contentType = isText ? "text/plain" : "application/octet-stream";
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`;
    buffers.push(Buffer.from(header, "utf8"));
    buffers.push(isText ? Buffer.from(file.content, "utf8") : file.content);
    buffers.push(Buffer.from("\r\n", "utf8"));
  }
  buffers.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  const body = Buffer.concat(buffers);
  const result = await httpsRequest({
    hostname: "api.cloudflare.com",
    path: `/client/v4/accounts/${accountId}/pages/projects/${name}/deployments`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
  }, body);
  return result.data;
}

async function main() {
  const vars = loadConfig(projectDir);
  const { token, accountId } = getCredentials(projectDir);
  if (!projectName) {
    projectName = (vars.APP_NAME || "app").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }
  console.log(`Deploying to Cloudflare Pages: ${projectName}`);
  console.log(`  App: ${vars.APP_NAME || "Unknown"}`);
  console.log(`  Account: ${accountId.slice(0, 8)}...`);
  await ensureProject(accountId, token, projectName);
  const files = collectWebFiles(projectDir, vars);
  if (files.length === 0) {
    console.error("ERROR: No web files found to deploy");
    process.exit(1);
  }
  console.log(`Uploading ${files.length} files...`);
  const result = await createDeployment(accountId, token, projectName, files);
  const url = result?.result?.url;
  if (url) {
    console.log(result.success ? "\nDeployment successful!" : "\nDeployment created:");
    console.log(`  URL: ${url}`);
    if (result.success) {
      console.log(`  Production: https://${projectName}.workers.dev`);
    }
  } else {
    console.log("\nDeployment response:", JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
