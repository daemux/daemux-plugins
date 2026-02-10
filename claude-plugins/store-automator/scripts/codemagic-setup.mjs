#!/usr/bin/env node

const args = process.argv.slice(2);
let tokenArg = '';
let branch = 'main';
let workflowId = 'default';
let trigger = false;
let wait = false;

for (const arg of args) {
  if (arg.startsWith('--token=')) {
    tokenArg = arg.slice('--token='.length);
  } else if (arg.startsWith('--branch=')) {
    branch = arg.slice('--branch='.length);
  } else if (arg.startsWith('--workflow=')) {
    workflowId = arg.slice('--workflow='.length);
  } else if (arg === '--trigger') {
    trigger = true;
  } else if (arg === '--wait') {
    wait = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node scripts/codemagic-setup.mjs [options]

Options:
  --token=TOKEN      Codemagic API token (or set CM_API_TOKEN env var)
  --branch=BRANCH    Branch to build (default: main)
  --workflow=ID      Workflow ID (default: default)
  --trigger          Trigger a build after setup
  --wait             Wait for build to finish (implies --trigger)
  -h, --help         Show this help message`);
    process.exit(0);
  }
}

if (wait) trigger = true;

const { runCodemagicSetup } = await import('../src/codemagic-setup.mjs');

try {
  await runCodemagicSetup({ tokenArg, branch, workflowId, trigger, wait });
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
