import { existsSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR, TYPO_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  getPackageDir, exec, ensureDir, ensureFile, readJson, writeJson,
} from './utils.mjs';
import { injectEnvVars, injectStatusLine } from './settings.mjs';

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

function clearCacheAndTypo() {
  console.log('Clearing plugin cache...');
  rmSync(CACHE_DIR, { recursive: true, force: true });
  rmSync(TYPO_DIR, { recursive: true, force: true });
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

function installClaudeMd(targetPath, packageDir) {
  const template = join(packageDir, 'templates', 'CLAUDE.md.template');
  if (!existsSync(template)) return;
  console.log('Installing CLAUDE.md...');
  ensureDir(join(targetPath, '..'));
  copyFileSync(template, targetPath);
}

function printSummary(scope, oldVersion, newVersion) {
  console.log('');
  const scopeLabel = scope === 'user' ? ' globally' : '';
  if (oldVersion && oldVersion !== newVersion) {
    console.log(`Done! Plugin updated${scopeLabel}: v${oldVersion} -> v${newVersion}`);
  } else if (oldVersion) {
    console.log(`Done! Plugin reinstalled${scopeLabel} (v${newVersion})`);
  } else {
    console.log(`Done! Plugin installed${scopeLabel} (v${newVersion})`);
  }
}

export async function runInstall(scope) {
  checkClaudeCli();

  console.log('Installing/updating Daemux Claude Plugins...');

  const oldVersion = readMarketplaceVersion();
  const packageDir = getPackageDir();

  copyPluginFiles(packageDir);
  clearCacheAndTypo();
  registerMarketplace();
  runClaudeInstall(scope);

  const newVersion = readMarketplaceVersion('unknown');

  const baseDir = scope === 'user'
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  ensureDir(baseDir);

  installClaudeMd(join(baseDir, 'CLAUDE.md'), packageDir);

  const scopeLabel = scope === 'user' ? 'global' : 'project';
  console.log(`Configuring ${scopeLabel} settings...`);
  const settingsPath = join(baseDir, 'settings.json');
  injectEnvVars(settingsPath);
  injectStatusLine(settingsPath);

  printSummary(scope, oldVersion, newVersion);
  console.log('');

  if (scope === 'user') {
    console.log('Note: Global install does not modify project-level settings.');
  } else {
    console.log('The plugin is ready to use. Configure additional env vars in .claude/settings.json as needed.');
  }
}
