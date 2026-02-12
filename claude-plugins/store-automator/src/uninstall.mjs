import { existsSync, rmSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  MARKETPLACE_DIR, KNOWN_MP_PATH, CACHE_DIR,
  MARKETPLACE_NAME, PLUGIN_REF,
  readJson, writeJson,
} from './utils.mjs';
import { removeEnvVars, removeStatusLine } from './settings.mjs';
import { removeMcpServers } from './mcp-setup.mjs';

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

function removeCiTemplates(projectDir) {
  const files = [
    'ci.config.yaml',
    'Gemfile',
  ];
  for (const file of files) {
    removeFileIfExists(join(projectDir, file), file);
  }

  const dirs = ['scripts', 'fastlane', 'web', 'ci-templates'];
  for (const dir of dirs) {
    const dirPath = join(projectDir, dir);
    if (existsSync(dirPath)) {
      console.log(`Removing ${dir}/...`);
      rmSync(dirPath, { recursive: true, force: true });
    }
  }

  removeGitHubWorkflow(projectDir);
}

function isDirEmpty(dirPath) {
  if (!existsSync(dirPath)) return true;
  return readdirSync(dirPath).length === 0;
}

function removeGitHubWorkflow(projectDir) {
  const workflowsDir = join(projectDir, '.github', 'workflows');
  const githubDir = join(projectDir, '.github');

  if (isDirEmpty(workflowsDir)) {
    rmSync(workflowsDir, { recursive: true, force: true });
    console.log('Removed empty .github/workflows/ directory.');
  }

  if (isDirEmpty(githubDir)) {
    rmSync(githubDir, { recursive: true, force: true });
    console.log('Removed empty .github/ directory.');
  }
}

export async function runUninstall(scope) {
  console.log(`Uninstalling Daemux Store Automator (scope: ${scope})...`);

  runClaudeUninstall(scope);

  if (scope === 'user') {
    console.log('Removing marketplace...');
    rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
    rmSync(CACHE_DIR, { recursive: true, force: true });
    unregisterMarketplace();
  }

  const isGlobal = scope === 'user';
  const baseDir = isGlobal ? join(homedir(), '.claude') : join(process.cwd(), '.claude');
  const scopeLabel = isGlobal ? 'global' : 'project';

  removeFileIfExists(join(baseDir, 'CLAUDE.md'), `${scopeLabel} CLAUDE.md`);
  removeCiTemplates(process.cwd());
  removeMcpServers(process.cwd());

  console.log(`Cleaning ${scopeLabel} settings...`);
  removeEnvVars(join(baseDir, 'settings.json'));
  removeStatusLine(join(baseDir, 'settings.json'));

  console.log(isGlobal
    ? '\nDone! store-automator uninstalled globally.'
    : `\nDone! store-automator uninstalled from this project.\n\nNote: Marketplace files remain in ${MARKETPLACE_DIR}\nRun with --global --uninstall to remove marketplace completely.`
  );
}
