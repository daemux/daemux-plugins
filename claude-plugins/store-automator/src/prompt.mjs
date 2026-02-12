import { promptAppIdentity } from './prompts/app-identity.mjs';
import { promptCredentials } from './prompts/credentials.mjs';
import { promptStoreSettings, promptWebSettings } from './prompts/store-settings.mjs';
import { askQuestion, getDefault, printSectionHeader } from './guide.mjs';

async function promptMcpTokens(rl, cliFlags, currentConfig) {
  const stitchVal = getDefault('stitchApiKey', cliFlags, currentConfig) || '';
  const cfTokenVal = getDefault('cloudflareToken', cliFlags, currentConfig) || '';
  const cfAcctVal = getDefault('cloudflareAccountId', cliFlags, currentConfig) || '';

  const result = {
    stitchApiKey: stitchVal,
    cloudflareToken: cfTokenVal,
    cloudflareAccountId: cfAcctVal,
  };

  if (result.stitchApiKey && result.cloudflareToken && result.cloudflareAccountId) {
    return result;
  }

  printSectionHeader('MCP Tokens (Optional)');
  console.log('Press Enter to skip any token you do not have yet.');
  console.log('');

  if (!result.stitchApiKey) {
    result.stitchApiKey = await askQuestion(rl, 'Stitch MCP API Key', currentConfig.stitchApiKey || '');
  }

  if (!result.cloudflareToken) {
    result.cloudflareToken = await askQuestion(rl, 'Cloudflare API Token', currentConfig.cloudflareToken || '');
  }

  if (result.cloudflareToken && !result.cloudflareAccountId) {
    result.cloudflareAccountId = await askQuestion(
      rl, 'Cloudflare Account ID', currentConfig.cloudflareAccountId || ''
    );
  }

  return result;
}

export async function promptAll(rl, cliFlags, currentConfig, projectDir) {
  const identity = await promptAppIdentity(rl, cliFlags, currentConfig);
  const credentials = await promptCredentials(rl, cliFlags, currentConfig, projectDir);
  const storeSettings = await promptStoreSettings(rl, cliFlags, currentConfig);
  const webSettings = await promptWebSettings(rl, cliFlags, currentConfig);
  const mcpTokens = await promptMcpTokens(rl, cliFlags, currentConfig);

  return { ...identity, ...credentials, ...storeSettings, ...webSettings, ...mcpTokens };
}
