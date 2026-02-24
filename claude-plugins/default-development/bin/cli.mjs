#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import updateNotifier from 'update-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const notifier = updateNotifier({ pkg });

const args = process.argv.slice(2);
let scope = 'project';
let action = 'install';
let onlyAgents = null;
let excludeAgents = null;
let listAgents = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (true) {
    case arg === '-g' || arg === '--global':
      scope = 'user';
      break;
    case arg === '-u' || arg === '--uninstall':
      action = 'uninstall';
      break;
    case arg === '--only':
      onlyAgents = (args[++i] || '').split(',').filter(Boolean);
      break;
    case arg.startsWith('--only='):
      onlyAgents = arg.slice('--only='.length).split(',').filter(Boolean);
      break;
    case arg === '--exclude':
      excludeAgents = (args[++i] || '').split(',').filter(Boolean);
      break;
    case arg.startsWith('--exclude='):
      excludeAgents = arg.slice('--exclude='.length).split(',').filter(Boolean);
      break;
    case arg === '--list':
      listAgents = true;
      break;
    case arg === '-h' || arg === '--help':
      console.log(`Usage: npx @daemux/claude-plugin [options]

Options:
  -g, --global     Install/uninstall globally (~/.claude) instead of project scope
  -u, --uninstall  Uninstall the plugin
  --only <agents>    Install only specified agents (comma-separated)
  --exclude <agents> Exclude specified agents (comma-separated)
  --list             List available agents and their tiers
  -v, --version    Show version number
  -h, --help       Show this help message

Examples:
  npx @daemux/claude-plugin                        Install for current project
  npx @daemux/claude-plugin -g                     Install globally
  npx @daemux/claude-plugin -u                     Uninstall from current project
  npx @daemux/claude-plugin -g -u                  Uninstall globally
  npx @daemux/claude-plugin --list                 List available agents
  npx @daemux/claude-plugin --only=developer,reviewer  Install only specified agents
  npx @daemux/claude-plugin --exclude=designer,devops  Exclude specified agents`);
      process.exit(0);
    case arg === '-v' || arg === '--version':
      console.log(pkg.version);
      process.exit(0);
  }
}

if (listAgents) {
  const { listAvailableAgents } = await import('../src/utils.mjs');
  listAvailableAgents();
  process.exit(0);
}

if (action === 'uninstall') {
  const { runUninstall } = await import('../src/uninstall.mjs');
  await runUninstall(scope);
} else {
  const { runInstall } = await import('../src/install.mjs');
  await runInstall(scope, { onlyAgents, excludeAgents });
}

notifier.notify();
