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
let isPostinstall = false;

const cliTokens = {};

const valueFlags = {
  '--stitch-key=': 'stitchApiKey',
  '--cloudflare-token=': 'cloudflareToken',
  '--cloudflare-account-id=': 'cloudflareAccountId',
  '--bundle-id=': 'bundleId',
  '--match-deploy-key=': 'matchDeployKey',
  '--match-git-url=': 'matchGitUrl',
};

for (const arg of args) {
  const valueFlagEntry = Object.entries(valueFlags).find(([prefix]) => arg.startsWith(prefix));
  if (valueFlagEntry) {
    cliTokens[valueFlagEntry[1]] = arg.slice(valueFlagEntry[0].length);
    continue;
  }

  switch (arg) {
    case '-g':
    case '--global':
      scope = 'user';
      break;
    case '-u':
    case '--uninstall':
      action = 'uninstall';
      break;
    case '--postinstall':
      isPostinstall = true;
      break;
    case '--github-actions':
      cliTokens.githubActions = true;
      break;
    case '-h':
    case '--help':
      console.log(`Usage: npx @daemux/store-automator [options]

Options:
  -g, --global                   Install globally (~/.claude) instead of project scope
  -u, --uninstall                Uninstall plugin and remove files
  --postinstall                  Run as postinstall hook (auto-detected)
  -v, --version                  Show version number
  -h, --help                     Show help

App Configuration:
  --bundle-id=ID                 Bundle ID / Package Name (e.g., com.company.app)

MCP Token Flags (skip interactive prompts):
  --stitch-key=KEY               Stitch MCP API key
  --cloudflare-token=TOKEN       Cloudflare API token
  --cloudflare-account-id=ID     Cloudflare account ID

GitHub Actions CI mode:
  --github-actions               Use GitHub Actions CI mode
  --match-deploy-key=PATH        Path to Match deploy key file
  --match-git-url=URL            Git URL for Match certificates repo

Examples:
  npx @daemux/store-automator                          Install for project
  npx @daemux/store-automator -g                       Install globally
  npx @daemux/store-automator -u                       Uninstall from project
  npx @daemux/store-automator -g -u                    Uninstall globally

GitHub Actions install:
  npx @daemux/store-automator --github-actions --bundle-id=ID --match-deploy-key=PATH --match-git-url=URL

Non-interactive install:
  npx @daemux/store-automator --bundle-id=ID --stitch-key=KEY
  npx @daemux/store-automator --cloudflare-token=TOKEN --cloudflare-account-id=ID`);
      process.exit(0);
    case '-v':
    case '--version':
      console.log(pkg.version);
      process.exit(0);
  }
}

if (cliTokens.githubActions) {
  const missing = [];
  if (!cliTokens.matchDeployKey) missing.push('--match-deploy-key');
  if (!cliTokens.matchGitUrl) missing.push('--match-git-url');
  if (!cliTokens.bundleId) missing.push('--bundle-id');
  if (missing.length > 0) {
    console.error(`Error: --github-actions requires: ${missing.join(', ')}`);
    console.error('');
    console.error('Example:');
    console.error('  npx @daemux/store-automator --github-actions \\');
    console.error('    --bundle-id=com.company.app \\');
    console.error('    --match-deploy-key=creds/match_deploy_key \\');
    console.error('    --match-git-url=git@github.com:org/certs.git');
    process.exit(1);
  }
}

notifier.notify();

try {
  if (action === 'uninstall') {
    const { runUninstall } = await import('../src/uninstall.mjs');
    await runUninstall(scope);
  } else {
    const { runInstall } = await import('../src/install.mjs');
    await runInstall(scope, isPostinstall, cliTokens);
  }
} catch (err) {
  if (isPostinstall) {
    console.log(`Warning: store-automator postinstall encountered an issue: ${err.message}`);
    console.log('Run "npx store-automator" manually to complete setup.');
    process.exit(0);
  } else {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
