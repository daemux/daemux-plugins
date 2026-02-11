import { existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  getPackageDir, exec, ensureDir, ensureFile, readJson, writeJson,
} from './utils.mjs';
import { injectEnvVars, injectStatusLine } from './settings.mjs';
import { promptForTokens } from './prompt.mjs';
import { getMcpServers, writeMcpJson, updateMcpAppId } from './mcp-setup.mjs';
import { installClaudeMd, installCiTemplates, installFirebaseTemplates } from './templates.mjs';
import { findAppByRepo, addApp, normalizeRepoUrl } from './codemagic-api.mjs';
import { writeCiAppId } from './ci-config.mjs';

function checkClaudeCli() {
  const result = exec('command -v claude') || exec('which claude');
  if (!result) {
    console.log('Claude CLI not found.');
    console.log('Install it first: https://docs.anthropic.com/en/docs/claude-code/overview');
    process.exit(1);
  }
}

function readMarketplaceVersion(fallback = '') {
  const mpJson = join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json');
  if (!existsSync(mpJson)) return fallback;
  try {
    return readJson(mpJson).metadata.version;
  } catch {
    return fallback;
  }
}

function copyPluginFiles(packageDir) {
  console.log('Installing marketplace...');
  rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
  ensureDir(MARKETPLACE_DIR);

  const dirs = ['.claude-plugin', 'plugins', 'templates'];
  for (const dir of dirs) {
    const src = join(packageDir, dir);
    const dest = join(MARKETPLACE_DIR, dir);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
    }
  }
}

function clearCache() {
  console.log('Clearing plugin cache...');
  rmSync(CACHE_DIR, { recursive: true, force: true });
}

function registerMarketplace() {
  console.log('Updating marketplace registration...');
  ensureFile(KNOWN_MP_PATH);
  let data;
  try {
    data = readJson(KNOWN_MP_PATH);
  } catch {
    data = {};
  }
  data[MARKETPLACE_NAME] = {
    source: { source: 'github', repo: 'daemux/daemux-plugins' },
    installLocation: MARKETPLACE_DIR,
    lastUpdated: new Date().toISOString(),
  };
  writeJson(KNOWN_MP_PATH, data);
}

function runClaudeInstall(scope) {
  console.log(`Installing plugin (scope: ${scope})...`);
  const scopeArg = scope === 'user' ? '' : ` --scope ${scope}`;
  try {
    execSync(`claude plugin install ${PLUGIN_REF}${scopeArg}`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.log(`Warning: claude plugin install returned non-zero (${err.status || 'unknown'})`);
  }
}

function printSummary(scope, oldVersion, newVersion) {
  console.log('');
  const scopeLabel = scope === 'user' ? ' globally' : '';
  if (oldVersion && oldVersion !== newVersion) {
    console.log(`Done! store-automator updated${scopeLabel}: v${oldVersion} -> v${newVersion}`);
  } else if (oldVersion) {
    console.log(`Done! store-automator reinstalled${scopeLabel} (v${newVersion})`);
  } else {
    console.log(`Done! store-automator installed${scopeLabel} (v${newVersion})`);
  }
}

function setupGitHubActions(codemagicToken) {
  if (!codemagicToken) return false;

  try {
    execFileSync('which', ['gh'], { encoding: 'utf8', stdio: 'pipe' });
    const authStatus = execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe' });
    if (authStatus.includes('not logged')) return false;

    execFileSync('gh', ['secret', 'set', 'CM_API_TOKEN', '--body', codemagicToken], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

async function setupCodemagicApp(projectDir, codemagicToken) {
  if (!codemagicToken) return;

  let repoUrl;
  try {
    const raw = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!raw) return;
    repoUrl = normalizeRepoUrl(raw);
  } catch {
    return;
  }

  try {
    let app = await findAppByRepo(codemagicToken, repoUrl);
    if (!app) {
      app = await addApp(codemagicToken, repoUrl);
      console.log(`Codemagic app created: ${app.appName || app._id}`);
    } else {
      console.log(`Codemagic app found: ${app.appName || app._id}`);
    }

    const written = writeCiAppId(projectDir, app._id);
    if (written) {
      console.log(`Codemagic app_id written to ci.config.yaml`);
    }

    updateMcpAppId(projectDir, app._id);
  } catch (err) {
    console.log(`Codemagic auto-setup skipped: ${err.message || err}`);
  }
}

export async function runInstall(scope, isPostinstall = false, cliTokens = {}) {
  checkClaudeCli();

  console.log('Installing/updating Daemux Store Automator...');

  const tokens = await promptForTokens(cliTokens);

  const projectDir = process.cwd();
  const servers = getMcpServers(tokens);
  writeMcpJson(projectDir, servers);

  const oldVersion = readMarketplaceVersion();
  const packageDir = getPackageDir();

  copyPluginFiles(packageDir);
  clearCache();
  registerMarketplace();
  runClaudeInstall(scope);

  const newVersion = readMarketplaceVersion('unknown');

  const baseDir = scope === 'user'
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  ensureDir(baseDir);

  installClaudeMd(join(baseDir, 'CLAUDE.md'), packageDir);
  installCiTemplates(projectDir, packageDir);
  installFirebaseTemplates(projectDir, packageDir);

  await setupCodemagicApp(projectDir, tokens.codemagicToken);

  const scopeLabel = scope === 'user' ? 'global' : 'project';
  console.log(`Configuring ${scopeLabel} settings...`);
  const settingsPath = join(baseDir, 'settings.json');
  injectEnvVars(settingsPath);
  injectStatusLine(settingsPath);

  const ghConfigured = setupGitHubActions(tokens.codemagicToken);
  if (ghConfigured) {
    console.log('GitHub Actions: CM_API_TOKEN secret configured.');
  } else if (tokens.codemagicToken) {
    console.log('GitHub Actions: secret not set (gh CLI unavailable or not authenticated).');
  }

  printSummary(scope, oldVersion, newVersion);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Fill ci.config.yaml (codemagic.app_id is auto-configured if token was provided)');
  console.log('  2. Add creds/AuthKey.p8 and creds/play-service-account.json');
  console.log('  3. Start Claude Code');
  if (!ghConfigured) {
    console.log('  Note: For auto-trigger, install gh CLI and run "gh auth login"');
  }
}
