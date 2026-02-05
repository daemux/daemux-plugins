#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";

// Configuration from environment variables
const config = {
  serverUser: process.env.DEPLOY_SERVER_USER || "",
  serverIp: process.env.DEPLOY_SERVER_IP || "",
  serverPort: process.env.DEPLOY_SERVER_PORT || "22",
  serverPassword: process.env.DEPLOY_SERVER_PASSWORD || "",
  sshKeyPath: process.env.DEPLOY_SSH_KEY_PATH || "",
  authMethod: process.env.DEPLOY_AUTH_METHOD || "key",
  projectName: process.env.DEPLOY_PROJECT_NAME || "",
  remoteProjectPath: process.env.DEPLOY_REMOTE_PATH || "",
  services: (process.env.DEPLOY_SERVICES || "").split(" ").filter(Boolean),
  dbHost: process.env.DEPLOY_DB_HOST || "",
  dbPort: process.env.DEPLOY_DB_PORT || "5432",
  dbName: process.env.DEPLOY_DB_NAME || "",
  dbUser: process.env.DEPLOY_DB_USER || "",
  dbPassword: process.env.DEPLOY_DB_PASSWORD || "",
  autoMigrate: process.env.DEPLOY_AUTO_MIGRATE === "true",
  migrationsPath: process.env.DEPLOY_MIGRATIONS_PATH || "migrations",
  projectTypes: process.env.DEPLOY_PROJECT_TYPES || "",
};

function validateConfig(): string | null {
  const required = ["serverUser", "serverIp", "projectName", "remoteProjectPath"];
  const missing = required.filter((key) => !config[key as keyof typeof config]);
  if (missing.length > 0) {
    return `Missing required environment variables: ${missing.map((k) => `DEPLOY_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}`).join(", ")}`;
  }
  return null;
}

function buildSshCommand(): string[] {
  const args: string[] = [];

  if (config.authMethod === "password") {
    return ["sshpass", "-e", "ssh", "-o", "StrictHostKeyChecking=no", "-p", config.serverPort];
  }

  args.push("ssh", "-o", "StrictHostKeyChecking=no", "-p", config.serverPort);
  if (config.sshKeyPath) {
    args.push("-i", config.sshKeyPath);
  }
  return args;
}

async function runCommand(command: string, args: string[], env?: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

async function localGitCommitAndPush(message: string): Promise<{ success: boolean; output: string }> {
  // 1. Check if there are any changes (staged, unstaged, or untracked)
  const status = await runCommand("git", ["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return { success: true, output: "No changes to commit" };
  }

  // 2. Stage ALL changes (like deploy.sh: git add -A)
  const add = await runCommand("git", ["add", "-A"]);
  if (add.code !== 0) {
    return { success: false, output: `Failed to stage changes: ${add.stderr}` };
  }

  // 3. Commit with message
  const commit = await runCommand("git", ["commit", "-m", message]);
  if (commit.code !== 0 && !commit.stderr.includes("nothing to commit")) {
    return { success: false, output: `Failed to commit: ${commit.stderr}` };
  }

  // 4. Push to remote
  const push = await runCommand("git", ["push"]);
  if (push.code !== 0) {
    return { success: false, output: `Failed to push: ${push.stderr}` };
  }

  return { success: true, output: "Changes committed and pushed" };
}

async function remoteExec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const sshCmd = buildSshCommand();
  const destination = `${config.serverUser}@${config.serverIp}`;

  // Debug: Log configuration
  if (!config.serverUser || !config.serverIp) {
    return {
      stdout: "",
      stderr: `SSH Error: Missing configuration. serverUser="${config.serverUser}", serverIp="${config.serverIp}"`,
      code: 1,
    };
  }

  const fullCommand = `${sshCmd.join(" ")} ${destination} "${command.replace(/"/g, '\\"')}"`;

  const env: Record<string, string> = {};
  if (config.authMethod === "password" && config.serverPassword) {
    env.SSHPASS = config.serverPassword;
  }

  const result = await runCommand("bash", ["-c", fullCommand], env);

  // Debug: If no output and non-zero exit, include the command for debugging
  if (!result.stdout && !result.stderr && result.code !== 0) {
    result.stderr = `SSH command failed with code ${result.code}. Command: ${sshCmd.join(" ")} ${destination} "..."`;
  }

  return result;
}

async function deploy(services: string[], commitMessage?: string): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  const targetServices = services.length > 0 ? services : config.services;
  if (targetServices.length === 0) {
    return "Error: No services specified. Set DEPLOY_SERVICES or provide services parameter.";
  }

  const message = commitMessage || `Deploy: ${targetServices.join(" ")}`;
  let output = `=== ${config.projectName} Deployment ===\n`;
  output += `Server: ${config.serverUser}@${config.serverIp}\n`;
  output += `Services: ${targetServices.join(", ")}\n`;
  output += `Message: ${message}\n\n`;

  // Local git commit and push
  output += "--- Committing local changes ---\n";
  const gitResult = await localGitCommitAndPush(message);
  output += gitResult.output + "\n\n";

  if (!gitResult.success) {
    return output + "Error: Git operation failed. Aborting deployment.";
  }

  // Pull latest code on server
  output += "--- Pulling latest code ---\n";
  const pullResult = await remoteExec(`cd ${config.remoteProjectPath} && git pull origin main`);
  if (pullResult.code !== 0) {
    return output + `Error: Failed to pull code\n${pullResult.stderr}`;
  }
  output += pullResult.stdout + "\n";

  // Restart services
  for (const service of targetServices) {
    output += `--- Restarting ${service} ---\n`;
    const restartResult = await remoteExec(`sudo systemctl restart ${service}`);
    if (restartResult.code !== 0) {
      output += `Error: Failed to restart ${service}\n${restartResult.stderr}\n`;
      continue;
    }

    // Wait for service to be active
    let attempts = 0;
    let isActive = false;
    while (attempts < 30) {
      const statusResult = await remoteExec(`systemctl is-active --quiet ${service}`);
      if (statusResult.code === 0) {
        isActive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
    }

    if (isActive) {
      output += `${service} is healthy\n`;
    } else {
      output += `Warning: ${service} may not be healthy after 30s\n`;
    }
  }

  output += "\n=== Deployment Complete ===\n";
  output += `Deployed: ${targetServices.join(", ")}`;
  return output;
}

async function viewLogs(service?: string, lines: number = 50, follow: boolean = false): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  const targetService = service || config.services[0];
  if (!targetService) {
    return "Error: No service specified. Set DEPLOY_SERVICES or provide service parameter.";
  }

  const followFlag = follow ? "-f" : "";
  const result = await remoteExec(`journalctl -u ${targetService} -n ${lines} --no-pager ${followFlag}`);

  if (result.code !== 0) {
    return `Error fetching logs for ${targetService}:\n${result.stderr}`;
  }

  return `=== Logs for ${targetService} (last ${lines} lines) ===\n${result.stdout}`;
}

async function checkStatus(service?: string): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  const services = service ? [service] : config.services;
  if (services.length === 0) {
    return "Error: No services configured. Set DEPLOY_SERVICES.";
  }

  let output = `=== Services Status on ${config.serverIp} ===\n`;

  for (const svc of services) {
    output += `\n--- ${svc} ---\n`;
    const result = await remoteExec(`systemctl status ${svc} --no-pager -l 2>&1 | head -15`);
    if (result.stderr) {
      output += `Error: ${result.stderr}\n`;
    } else if (result.stdout) {
      output += result.stdout;
    } else {
      output += `Service not found or not running (exit code: ${result.code})\n`;
    }
  }

  return output;
}

async function runMigration(sqlFile: string): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  if (!config.dbHost || !config.dbName) {
    return "Error: Database not configured. Set DEPLOY_DB_HOST, DEPLOY_DB_NAME, DEPLOY_DB_USER, DEPLOY_DB_PASSWORD.";
  }

  let output = `=== Running Database Migration ===\n`;
  output += `SQL file: ${sqlFile}\n`;
  output += `Database: ${config.dbName} @ ${config.dbHost}:${config.dbPort}\n\n`;

  const result = await remoteExec(
    `PGPASSWORD='${config.dbPassword}' psql -h '${config.dbHost}' -p '${config.dbPort}' -U '${config.dbUser}' -d '${config.dbName}' -f '${config.remoteProjectPath}/${sqlFile}'`
  );

  if (result.code !== 0) {
    return output + `Error: Migration failed\n${result.stderr}`;
  }

  output += result.stdout + "\n";
  output += "=== Migration Complete ===";
  return output;
}

async function initMigrations(): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  if (!config.dbHost || !config.dbName) {
    return "Error: Database not configured.";
  }

  let output = "=== Initializing Schema Migrations ===\n";

  // Create migrations table
  const createTable = await remoteExec(
    `PGPASSWORD='${config.dbPassword}' psql -h '${config.dbHost}' -p '${config.dbPort}' -U '${config.dbUser}' -d '${config.dbName}' -c "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"`
  );

  if (createTable.code !== 0) {
    return output + `Error: Could not create migrations table\n${createTable.stderr}`;
  }

  // Find migration files
  const migrationsDir = `${config.remoteProjectPath}/${config.migrationsPath}`;
  const findFiles = await remoteExec(`find '${migrationsDir}' -maxdepth 1 -name '*.sql' -type f -exec basename {} \\; 2>/dev/null | sort`);

  const files = findFiles.stdout.trim().split("\n").filter(Boolean);
  if (files.length === 0) {
    return output + "No migration files found.";
  }

  let count = 0;
  for (const file of files) {
    const checkExists = await remoteExec(
      `PGPASSWORD='${config.dbPassword}' psql -h '${config.dbHost}' -p '${config.dbPort}' -U '${config.dbUser}' -d '${config.dbName}' -t -c "SELECT 1 FROM schema_migrations WHERE version = '${file}';"`
    );

    if (!checkExists.stdout.trim()) {
      const insert = await remoteExec(
        `PGPASSWORD='${config.dbPassword}' psql -h '${config.dbHost}' -p '${config.dbPort}' -U '${config.dbUser}' -d '${config.dbName}' -c "INSERT INTO schema_migrations (version) VALUES ('${file}');"`
      );
      if (insert.code === 0) {
        output += `Marked as applied: ${file}\n`;
        count++;
      }
    }
  }

  output += `\n=== Initialization Complete ===\nMarked ${count} migration(s) as applied`;
  return output;
}

async function getServiceHealth(service: string): Promise<string> {
  const validationError = validateConfig();
  if (validationError) return `Error: ${validationError}`;

  let output = `=== Health Check: ${service} ===\n`;

  // Get restart count
  const restarts = await remoteExec(`systemctl show ${service} --property=NRestarts`);
  output += `Restarts: ${restarts.stdout.trim()}\n`;

  // Get uptime
  const uptime = await remoteExec(`systemctl show ${service} --property=ActiveEnterTimestamp`);
  output += `Started: ${uptime.stdout.trim()}\n`;

  // Check active status
  const status = await remoteExec(`systemctl is-active ${service}`);
  output += `Status: ${status.stdout.trim()}\n`;

  // Check for errors in recent logs
  const errors = await remoteExec(`journalctl -u ${service} -n 100 --no-pager | grep -iE 'error|failed|exit|exception|traceback' | tail -10`);
  if (errors.stdout.trim()) {
    output += `\nRecent errors:\n${errors.stdout}`;
  } else {
    output += `\nNo recent errors found.`;
  }

  return output;
}

// Create server
const server = new Server(
  {
    name: "daemux-deploy-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "deploy",
        description: "Deploy services to production server. Pulls latest code and restarts services.",
        inputSchema: {
          type: "object",
          properties: {
            services: {
              type: "array",
              items: { type: "string" },
              description: "Services to deploy. Leave empty for all configured services.",
            },
            message: {
              type: "string",
              description: "Commit message for the deployment.",
            },
          },
        },
      },
      {
        name: "deploy_logs",
        description: "View logs from a service on the production server.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Service name to view logs for.",
            },
            lines: {
              type: "number",
              description: "Number of log lines to retrieve (default: 50).",
            },
          },
        },
      },
      {
        name: "deploy_status",
        description: "Check status of services on the production server.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Specific service to check. Leave empty for all services.",
            },
          },
        },
      },
      {
        name: "deploy_health",
        description: "Get detailed health information for a service including restart count, uptime, and recent errors.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Service name to check health for.",
            },
          },
          required: ["service"],
        },
      },
      {
        name: "deploy_migrate",
        description: "Run a SQL migration file on the remote database.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Path to SQL file relative to project root (e.g., migrations/001_create_users.sql).",
            },
          },
          required: ["file"],
        },
      },
      {
        name: "deploy_init_migrations",
        description: "Initialize the migrations table and mark existing migrations as applied.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "deploy_remote_exec",
        description: "Execute an arbitrary command on the remote server via SSH.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Command to execute on the remote server.",
            },
          },
          required: ["command"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "deploy":
        result = await deploy(
          (args?.services as string[]) || [],
          args?.message as string | undefined
        );
        break;

      case "deploy_logs":
        result = await viewLogs(
          args?.service as string | undefined,
          (args?.lines as number) || 50
        );
        break;

      case "deploy_status":
        result = await checkStatus(args?.service as string | undefined);
        break;

      case "deploy_health":
        result = await getServiceHealth(args?.service as string);
        break;

      case "deploy_migrate":
        result = await runMigration(args?.file as string);
        break;

      case "deploy_init_migrations":
        result = await initMigrations();
        break;

      case "deploy_remote_exec":
        const execResult = await remoteExec(args?.command as string);
        result = execResult.stdout || execResult.stderr || "(no output)";
        if (execResult.code !== 0) {
          result = `Exit code: ${execResult.code}\n${result}`;
        }
        break;

      default:
        result = `Unknown tool: ${name}`;
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
