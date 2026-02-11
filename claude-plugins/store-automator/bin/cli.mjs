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
};

for (const arg of args) {
  let v;
  if ((v = flagValue(arg, '--token=')) !== undefined) { cmTokenArg = v; continue; }
  if ((v = flagValue(arg, '--branch=')) !== undefined) { cmBranch = v; continue; }
  if ((v = flagValue(arg, '--workflow=')) !== undefined) { cmWorkflowId = v; continue; }

  let matched = false;
  for (const [prefix, key] of Object.entries(valueFlags)) {
    if ((v = flagValue(arg, prefix)) !== undefined) {
      cliTokens[key] = v;
      matched = true;
      break;
    }
  }
  if (matched) continue;

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

GitHub Actions (auto-configured during install if gh CLI available):
  --github-setup                 Set CM_API_TOKEN secret for GitHub Actions
  --token=TOKEN                  API token (or set CM_API_TOKEN env var)

Examples:
  npx @daemux/store-automator                          Install for project
  npx @daemux/store-automator -g                       Install globally
  npx @daemux/store-automator -u                       Uninstall from project
  npx @daemux/store-automator -g -u                    Uninstall globally
  npx @daemux/store-automator --codemagic-setup        Register with Codemagic
  npx @daemux/store-automator --codemagic-setup --trigger --wait  Trigger and wait
  npx @daemux/store-automator --github-setup           Configure GitHub Actions

Non-interactive install (CI/CD):
  npx @daemux/store-automator --bundle-id=com.company.app --codemagic-token=TOKEN --codemagic-team-id=ID --stitch-key=KEY
  npx @daemux/store-automator --cloudflare-token=TOKEN --cloudflare-account-id=ID`);
      process.exit(0);
      break; // eslint: no-fallthrough
    case '-v':
    case '--version':
      console.log(pkg.version);
      process.exit(0);
      break; // eslint: no-fallthrough
  }
}

if (cmWait) cmTrigger = true;

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
