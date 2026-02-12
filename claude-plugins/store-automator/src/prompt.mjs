import { createInterface } from 'node:readline';
import { promptAppIdentity } from './prompts/app-identity.mjs';
import { promptCredentials } from './prompts/credentials.mjs';
import { promptStoreSettings, promptWebSettings } from './prompts/store-settings.mjs';
import { askQuestion } from './guide.mjs';

function isInteractive() {
  return Boolean(process.stdin.isTTY);
}

function isNonInteractive() {
  return Boolean(process.env.npm_config_yes) || process.argv.includes('--postinstall');
}

function allPromptsProvided(cliFlags) {
  return (
    cliFlags.bundleId !== undefined &&
    cliFlags.stitchApiKey !== undefined &&
    cliFlags.cloudflareToken !== undefined &&
    cliFlags.cloudflareAccountId !== undefined
  );
}

async function promptMcpTokens(rl, cliFlags, currentConfig) {
  const result = {
    stitchApiKey: cliFlags.stitchApiKey ?? '',
    cloudflareToken: cliFlags.cloudflareToken ?? '',
    cloudflareAccountId: cliFlags.cloudflareAccountId ?? '',
  };

  const allProvided = (
    cliFlags.stitchApiKey !== undefined &&
    cliFlags.cloudflareToken !== undefined &&
    cliFlags.cloudflareAccountId !== undefined
  );

  if (allProvided) return result;

  console.log('Press Enter to skip any token you do not have yet.');
  console.log('');

  if (cliFlags.stitchApiKey === undefined) {
    result.stitchApiKey = await askQuestion(rl, 'Stitch MCP API Key', currentConfig.stitchApiKey || '');
  }

  if (cliFlags.cloudflareToken === undefined) {
    result.cloudflareToken = await askQuestion(rl, 'Cloudflare API Token', currentConfig.cloudflareToken || '');
  }

  if (result.cloudflareToken && cliFlags.cloudflareAccountId === undefined) {
    result.cloudflareAccountId = await askQuestion(
      rl, 'Cloudflare Account ID', currentConfig.cloudflareAccountId || ''
    );
  }

  return result;
}

export async function promptAll(rl, cliFlags, currentConfig, projectDir) {
  console.log('');
  console.log('\x1b[1m\x1b[36m=== Store Automator — Interactive Setup ===\x1b[0m');

  const identity = await promptAppIdentity(rl, cliFlags, currentConfig);

  const credentials = await promptCredentials(rl, cliFlags, currentConfig, projectDir);

  const storeSettings = await promptStoreSettings(rl, cliFlags, currentConfig);

  const webSettings = await promptWebSettings(rl, cliFlags, currentConfig);

  console.log('');
  console.log('\x1b[1m\x1b[36m=== MCP Tokens (Optional) ===\x1b[0m');
  console.log('');
  const mcpTokens = await promptMcpTokens(rl, cliFlags, currentConfig);

  return { ...identity, ...credentials, ...storeSettings, ...webSettings, ...mcpTokens };
}

export async function promptForTokens(cliTokens = {}) {
  const result = {
    bundleId: cliTokens.bundleId ?? '',
    stitchApiKey: cliTokens.stitchApiKey ?? '',
    cloudflareToken: cliTokens.cloudflareToken ?? '',
    cloudflareAccountId: cliTokens.cloudflareAccountId ?? '',
  };

  if (allPromptsProvided(cliTokens)) {
    console.log('All configuration provided via CLI flags, skipping prompts.');
    return result;
  }

  if (!isInteractive() || isNonInteractive()) {
    console.log('Non-interactive terminal detected, skipping prompts.');
    console.log('Run "npx store-automator" manually to configure.');
    return result;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const all = await promptAll(rl, cliTokens, {}, process.cwd());
    return {
      ...all,
      bundleId: all.bundleId || result.bundleId,
      stitchApiKey: all.stitchApiKey || result.stitchApiKey,
      cloudflareToken: all.cloudflareToken || result.cloudflareToken,
      cloudflareAccountId: all.cloudflareAccountId || result.cloudflareAccountId,
    };
  } finally {
    rl.close();
  }
}
