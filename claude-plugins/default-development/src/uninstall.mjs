import { existsSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  readJson, writeJson,
} from './utils.mjs';
import { removeEnvVars, removeStatusLine } from './settings.mjs';

function runClaudeUninstall(scope) {
  const scopeArg = scope === 'user' ? '' : ` --scope ${scope}`;
  try {
    execSync(`claude plugin uninstall ${PLUGIN_REF}${scopeArg}`, {
      stdio: 'inherit',
    });
  } catch {
    // Plugin may not be installed; continue gracefully
  }
}

function unregisterMarketplace() {
  if (!existsSync(KNOWN_MP_PATH)) return;
  try {
    console.log('Removing marketplace registration...');
    const data = readJson(KNOWN_MP_PATH);
    delete data[MARKETPLACE_NAME];
    writeJson(KNOWN_MP_PATH, data);
  } catch {
    // Silently skip if file is invalid
  }
}

function removeFileIfExists(filePath, label) {
  if (existsSync(filePath)) {
    console.log(`Removing ${label}...`);
    unlinkSync(filePath);
  }
}

export async function runUninstall(scope) {
  console.log(`Uninstalling Daemux Claude Plugins (scope: ${scope})...`);

  runClaudeUninstall(scope);

  if (scope === 'user') {
    console.log('Removing marketplace...');
    rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
    rmSync(CACHE_DIR, { recursive: true, force: true });
    unregisterMarketplace();
  }

  const baseDir = scope === 'user'
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  const scopeLabel = scope === 'user' ? 'global' : 'project';

  removeFileIfExists(join(baseDir, 'CLAUDE.md'), `${scopeLabel} CLAUDE.md`);

  const settingsPath = join(baseDir, 'settings.json');
  console.log(`Cleaning ${scopeLabel} settings...`);
  removeEnvVars(settingsPath);
  removeStatusLine(settingsPath);

  console.log('');
  if (scope === 'user') {
    console.log('Done! Plugin uninstalled globally.');
  } else {
    console.log('Done! Plugin uninstalled from this project.');
    console.log('');
    console.log(`Note: Marketplace files remain in ${MARKETPLACE_DIR}`);
    console.log('Run with --global --uninstall to remove marketplace completely.');
  }
}
