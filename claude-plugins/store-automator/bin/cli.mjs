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
  '--app-name=': 'appName',
  '--key-id=': 'keyId',
  '--issuer-id=': 'issuerId',
  '--keystore-password=': 'keystorePassword',
  '--sku=': 'sku',
  '--apple-id=': 'appleId',
  '--primary-category=': 'primaryCategory',
  '--secondary-category=': 'secondaryCategory',
  '--price-tier=': 'priceTier',
  '--submit-for-review=': 'submitForReview',
  '--automatic-release=': 'automaticRelease',
  '--track=': 'track',
  '--rollout-fraction=': 'rolloutFraction',
  '--in-app-update-priority=': 'inAppUpdatePriority',
  '--domain=': 'domain',
  '--cf-project-name=': 'cfProjectName',
  '--tagline=': 'tagline',
  '--primary-color=': 'primaryColor',
  '--secondary-color=': 'secondaryColor',
  '--company-name=': 'companyName',
  '--contact-email=': 'contactEmail',
  '--support-email=': 'supportEmail',
  '--jurisdiction=': 'jurisdiction',
  '--languages=': 'languages',
  '--match-deploy-key=': 'matchDeployKey',
  '--match-deploy-key-path=': 'matchDeployKeyPath',
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

App Identity:
  --app-name=NAME                App display name
  --bundle-id=ID                 Bundle ID / Package Name (e.g., com.company.app)
  --sku=SKU                      App Store Connect SKU
  --apple-id=EMAIL               Apple Developer Account Email

Credentials:
  --key-id=ID                    App Store Connect Key ID
  --issuer-id=ID                 App Store Connect Issuer ID
  --keystore-password=PASS       Android keystore password
  --match-deploy-key-path=PATH   Path to Match deploy key
  --match-git-url=URL            Match certificates Git URL (SSH)

iOS Store Settings:
  --primary-category=CAT         iOS primary category (e.g., UTILITIES)
  --secondary-category=CAT       iOS secondary category
  --price-tier=N                 iOS price tier (0 = free)
  --submit-for-review=BOOL       Auto-submit for review (true/false)
  --automatic-release=BOOL       Auto-release after approval (true/false)

Android Store Settings:
  --track=TRACK                  Android release track (internal/alpha/beta/production)
  --rollout-fraction=N           Rollout fraction (0.0-1.0)
  --in-app-update-priority=N     In-app update priority (0-5)

Web Settings:
  --domain=DOMAIN                Web domain (e.g., myapp-pages.pages.dev)
  --cf-project-name=NAME         Cloudflare Pages project name
  --tagline=TEXT                  App tagline
  --primary-color=HEX            Primary color (e.g., #2563EB)
  --secondary-color=HEX          Secondary color
  --company-name=NAME            Company name
  --contact-email=EMAIL          Contact email
  --support-email=EMAIL          Support email
  --jurisdiction=TEXT             Legal jurisdiction

Languages:
  --languages=LANGS              Comma-separated language codes (e.g., en-US,de-DE)

MCP Token Flags (skip interactive prompts):
  --stitch-key=KEY               Stitch MCP API key
  --cloudflare-token=TOKEN       Cloudflare API token
  --cloudflare-account-id=ID     Cloudflare account ID

GitHub Actions CI mode:
  --github-actions               Use GitHub Actions CI mode
  --match-deploy-key=PATH        Path to Match deploy key file
  --match-git-url=URL            Git URL for Match certificates repo

Examples:
  npx @daemux/store-automator
  npx @daemux/store-automator --app-name="My App" --bundle-id=com.company.app
  npx @daemux/store-automator --github-actions --bundle-id=ID --match-deploy-key=PATH --match-git-url=URL`);
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
