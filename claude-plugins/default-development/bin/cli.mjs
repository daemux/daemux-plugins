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

for (const arg of args) {
  switch (arg) {
    case '-g':
    case '--global':
      scope = 'user';
      break;
    case '-u':
    case '--uninstall':
      action = 'uninstall';
      break;
    case '-h':
    case '--help':
      console.log(`Usage: npx @daemux/claude-plugin [options]

Options:
  -g, --global     Install/uninstall globally (~/.claude) instead of project scope
  -u, --uninstall  Uninstall the plugin
  -v, --version    Show version number
  -h, --help       Show this help message

Examples:
  npx @daemux/claude-plugin            Install for current project
  npx @daemux/claude-plugin -g         Install globally
  npx @daemux/claude-plugin -u         Uninstall from current project
  npx @daemux/claude-plugin -g -u      Uninstall globally`);
      process.exit(0);
    case '-v':
    case '--version':
      console.log(pkg.version);
      process.exit(0);
  }
}

if (action === 'uninstall') {
  const { runUninstall } = await import('../src/uninstall.mjs');
  await runUninstall(scope);
} else {
  const { runInstall } = await import('../src/install.mjs');
  await runInstall(scope);
}

notifier.notify();
