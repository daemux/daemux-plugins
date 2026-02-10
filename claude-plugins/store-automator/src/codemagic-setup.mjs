import { findAppByRepo, addApp, startBuild, getBuildStatus, normalizeRepoUrl } from './codemagic-api.mjs';
import { exec } from './utils.mjs';
import { execFileSync } from 'child_process';

const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['finished', 'failed', 'canceled']);

function resolveToken(tokenArg) {
  const token = process.env.CM_API_TOKEN || tokenArg;
  if (!token) {
    console.error('Codemagic API token required. Set CM_API_TOKEN or pass --token=...');
    process.exit(1);
  }
  return token;
}

function resolveRepoUrl() {
  const url = exec('git remote get-url origin');
  if (!url) {
    console.error('Not a git repository. Run from your project root.');
    process.exit(1);
  }
  return normalizeRepoUrl(url);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOwnerRepo(repoUrl) {
  const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function setupWebhook(repoUrl, appId) {
  const ownerRepo = extractOwnerRepo(repoUrl);
  if (!ownerRepo) {
    console.log('Warning: Cannot extract owner/repo from URL. Skipping webhook setup.');
    return false;
  }

  const { owner, repo } = ownerRepo;
  const webhookUrl = `https://api.codemagic.io/hooks/${appId}`;

  if (!exec('which gh')) {
    console.log('');
    console.log('GitHub CLI not found. Webhook not created.');
    console.log('To enable auto-triggering, manually create webhook:');
    console.log(`  Repository: ${owner}/${repo}`);
    console.log(`  URL: ${webhookUrl}`);
    console.log(`  Content type: application/json`);
    console.log(`  Events: push, pull_request, create`);
    return false;
  }

  try {
    const payload = JSON.stringify({
      name: 'web',
      active: true,
      events: ['push', 'pull_request', 'create'],
      config: { url: webhookUrl, content_type: 'json' },
    });

    execFileSync('gh', ['api', `repos/${owner}/${repo}/hooks`, '-X', 'POST', '--input', '-'], {
      input: payload,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`Webhook created: ${owner}/${repo} → Codemagic`);
    return true;
  } catch (error) {
    const errorMsg = String(error?.message || error);
    if (errorMsg.includes('422') || errorMsg.includes('already exists')) {
      console.log('Webhook already exists.');
      return true;
    }
    console.log(`Warning: Cannot create webhook (${errorMsg})`);
    console.log('Create manually in GitHub repository settings.');
    return false;
  }
}

async function pollBuildStatus(token, buildId) {
  console.log(`Polling build ${buildId} (every 30s, max 15 min)...`);
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const build = await getBuildStatus(token, buildId);
    const status = build.status || 'unknown';
    console.log(`  Build status: ${status}`);

    if (TERMINAL_STATUSES.has(status)) {
      return status;
    }
  }

  console.log('Build still running. Check dashboard.');
  return 'timeout';
}

export async function runCodemagicSetup(options) {
  const {
    tokenArg = '',
    branch = 'main',
    workflowId = 'default',
    trigger = false,
    wait = false,
  } = options;

  const token = resolveToken(tokenArg);
  const repoUrl = resolveRepoUrl();

  console.log(`Repository: ${repoUrl}`);
  console.log('Checking Codemagic for existing app...');

  let app = await findAppByRepo(token, repoUrl);

  if (app) {
    console.log(`App already registered: ${app.appName || app._id}`);
  } else {
    console.log('App not found. Adding to Codemagic...');
    app = await addApp(token, repoUrl);
    console.log(`App added: ${app.appName || app._id}`);

    console.log('Setting up GitHub webhook...');
    setupWebhook(repoUrl, app._id);
  }

  const appId = app._id;

  if (!trigger) {
    console.log('\nSetup complete. Use --trigger to start a build.\n');
    console.log('To enable GitHub Actions auto-trigger:');
    console.log('  1. Fill codemagic.app_id in ci.config.yaml');
    console.log('  2. Run: npx @daemux/store-automator --github-setup');
    return { appId, buildId: null, status: null };
  }

  console.log(`\nTriggering build on branch "${branch}" (workflow: ${workflowId})...`);
  const buildResult = await startBuild(token, appId, workflowId, branch);
  const buildId = buildResult.buildId;
  console.log(`Build started: ${buildId}`);

  if (!wait) {
    console.log('Use --wait to poll until completion.');
    return { appId, buildId, status: null };
  }

  const status = await pollBuildStatus(token, buildId);

  if (status === 'finished') {
    console.log('Build finished successfully.');
  } else if (status === 'failed') {
    console.error('Build failed.');
    process.exit(1);
  } else if (status === 'canceled') {
    console.log('Build was canceled.');
  }

  return { appId, buildId, status };
}
