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
let cmTokenArg = '';
let cmBranch = 'main';
let cmWorkflowId = 'default';
let cmTrigger = false;
let cmWait = false;

const cliTokens = {};

function flagValue(arg, prefix) {
  return arg.startsWith(prefix) ? arg.slice(prefix.length) : undefined;
}

const valueFlags = {
  '--codemagic-token=': 'codemagicToken',
  '--codemagic-team-id=': 'codemagicTeamId',
  '--stitch-key=': 'stitchApiKey',
  '--cloudflare-token=': 'cloudflareToken',
  '--cloudflare-account-id=': 'cloudflareAccountId',
  '--bundle-id=': 'bundleId',
  '--match-deploy-key=': 'matchDeployKey',
  '--match-git-url=': 'matchGitUrl',
};

for (const arg of args) {
  let v;
  if ((v = flagValue(arg, '--token=')) !== undefined) { cmTokenArg = v; continue; }
  if ((v = flagValue(arg, '--branch=')) !== undefined) { cmBranch = v; continue; }
  if ((v = flagValue(arg, '--workflow=')) !== undefined) { cmWorkflowId = v; continue; }

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
    case '--codemagic-setup':
      action = 'codemagic-setup';
      break;
    case '--github-setup':
      action = 'github-setup';
      break;
    case '--github-actions':
      cliTokens.githubActions = true;
      break;
    case '--trigger':
      cmTrigger = true;
      break;
    case '--wait':
      cmWait = true;
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
  --codemagic-token=TOKEN        Codemagic API token
  --codemagic-team-id=ID         Codemagic Team ID (from Teams page)
  --stitch-key=KEY               Stitch MCP API key
  --cloudflare-token=TOKEN       Cloudflare API token
  --cloudflare-account-id=ID     Cloudflare account ID

Codemagic:
  --codemagic-setup              Register repo and optionally trigger build
  --token=TOKEN                  API token (or set CM_API_TOKEN env var)
  --branch=BRANCH                Branch to build (default: main)
  --workflow=ID                  Workflow ID (default: default)
  --trigger                      Trigger build after setup
  --wait                         Wait for build completion (implies --trigger)

GitHub Actions CI mode:
  --github-actions               Use GitHub Actions instead of Codemagic (skip MCP setup)
  --match-deploy-key=PATH        Path to Match deploy key file (required with --github-actions)
  --match-git-url=URL            Git URL for Match certificates repo (required with --github-actions)

GitHub Actions (auto-configured during install if gh CLI available):
  --github-setup                 Set CM_API_TOKEN secret for GitHub Actions
  --token=TOKEN                  API token (or set CM_API_TOKEN env var)

Examples:
  npx @daemux/store-automator                          Install for project (Codemagic)
  npx @daemux/store-automator -g                       Install globally
  npx @daemux/store-automator -u                       Uninstall from project
  npx @daemux/store-automator -g -u                    Uninstall globally
  npx @daemux/store-automator --codemagic-setup        Register with Codemagic
  npx @daemux/store-automator --codemagic-setup --trigger --wait  Trigger and wait
  npx @daemux/store-automator --github-setup           Configure GitHub Actions secret

GitHub Actions install:
  npx @daemux/store-automator --github-actions --bundle-id=ID --match-deploy-key=PATH --match-git-url=URL

Non-interactive install (Codemagic):
  npx @daemux/store-automator --bundle-id=ID --codemagic-token=TOKEN --stitch-key=KEY
  npx @daemux/store-automator --cloudflare-token=TOKEN --cloudflare-account-id=ID`);
      process.exit(0);
    case '-v':
    case '--version':
      console.log(pkg.version);
      process.exit(0);
  }
}

if (cmWait) cmTrigger = true;

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
  if (action === 'codemagic-setup') {
    const { runCodemagicSetup } = await import('../src/codemagic-setup.mjs');
    await runCodemagicSetup({
      tokenArg: cmTokenArg,
      branch: cmBranch,
      workflowId: cmWorkflowId,
      trigger: cmTrigger,
      wait: cmWait,
    });
  } else if (action === 'github-setup') {
    const { runGitHubSetup } = await import('../src/github-setup.mjs');
    await runGitHubSetup({ tokenArg: cmTokenArg });
  } else if (action === 'uninstall') {
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
