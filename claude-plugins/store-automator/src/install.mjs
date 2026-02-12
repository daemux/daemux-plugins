import { existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  getPackageDir, exec, ensureDir, ensureFile, readJson, writeJson,
} from './utils.mjs';
import { injectEnvVars, injectStatusLine } from './settings.mjs';
import { promptForTokens } from './prompt.mjs';
import { getMcpServers, writeMcpJson } from './mcp-setup.mjs';
import { installClaudeMd, installCiTemplates, installFirebaseTemplates } from './templates.mjs';
import { writeCiBundleId, writeCiPackageName } from './ci-config.mjs';
import { installGitHubActionsPath, installCodemagicPath } from './install-paths.mjs';

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

function printNextSteps(isGitHubActions) {
  console.log('');
  console.log('Next steps:');
  if (isGitHubActions) {
    console.log('  1. Fill ci.config.yaml with credentials');
    console.log('  2. Add creds/AuthKey.p8 and creds/play-service-account.json');
    console.log('  3. Set MATCH_PASSWORD secret in GitHub repository settings');
    console.log('  4. Start Claude Code');
  } else {
    console.log('  1. Fill ci.config.yaml (codemagic.app_id is auto-configured if token was provided)');
    console.log('  2. Add creds/AuthKey.p8 and creds/play-service-account.json');
    console.log('  3. Start Claude Code');
    console.log('  Note: For auto-trigger, install gh CLI and run "gh auth login"');
  }
}

export async function runInstall(scope, isPostinstall = false, cliTokens = {}) {
  checkClaudeCli();

  console.log('Installing/updating Daemux Store Automator...');

  const isGitHubActions = Boolean(cliTokens.githubActions);

  const tokens = isGitHubActions
    ? { bundleId: cliTokens.bundleId ?? '' }
    : await promptForTokens(cliTokens);

  const projectDir = process.cwd();

  if (!isGitHubActions) {
    const servers = getMcpServers(tokens);
    writeMcpJson(projectDir, servers);
  }

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

  if (tokens.bundleId) {
    const written = writeCiBundleId(projectDir, tokens.bundleId);
    if (written) console.log(`Bundle ID set in ci.config.yaml: ${tokens.bundleId}`);
    writeCiPackageName(projectDir, tokens.bundleId);
  }

  if (isGitHubActions) {
    installGitHubActionsPath(projectDir, packageDir, cliTokens);
  } else {
    await installCodemagicPath(projectDir, tokens);
  }

  const scopeLabel = scope === 'user' ? 'global' : 'project';
  console.log(`Configuring ${scopeLabel} settings...`);
  const settingsPath = join(baseDir, 'settings.json');
  injectEnvVars(settingsPath);
  injectStatusLine(settingsPath);

  printSummary(scope, oldVersion, newVersion);
  printNextSteps(isGitHubActions);
}
