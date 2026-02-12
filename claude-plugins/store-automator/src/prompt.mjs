import { createInterface } from 'node:readline';

function isInteractive() {
  return Boolean(process.stdin.isTTY);
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function allTokensProvided(cliTokens) {
  return (
    cliTokens.stitchApiKey !== undefined &&
    cliTokens.cloudflareToken !== undefined &&
    cliTokens.cloudflareAccountId !== undefined
  );
}

function allPromptsProvided(cliTokens) {
  return (
    cliTokens.bundleId !== undefined &&
    allTokensProvided(cliTokens)
  );
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

  if (!isInteractive()) {
    console.log('Non-interactive terminal detected, skipping prompts.');
    console.log('Run "npx store-automator" manually to configure.');
    return result;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');

  try {
    if (cliTokens.bundleId === undefined) {
      console.log('App Configuration');
      console.log('');
      result.bundleId = await ask(
        rl,
        'Bundle ID / Package Name (e.g., com.company.app): '
      );
      console.log('');
    }

    if (allTokensProvided(cliTokens)) {
      console.log('All MCP tokens provided via CLI flags.');
      return result;
    }

    console.log('MCP Server Configuration');
    console.log('Press Enter to skip any token you do not have yet.');
    console.log('');

    if (cliTokens.stitchApiKey === undefined) {
      result.stitchApiKey = await ask(
        rl,
        'Stitch MCP API Key (STITCH_API_KEY value): '
      );
    }

    if (cliTokens.cloudflareToken === undefined) {
      result.cloudflareToken = await ask(
        rl,
        'Cloudflare API Token: '
      );
    }

    if (result.cloudflareToken && cliTokens.cloudflareAccountId === undefined) {
      result.cloudflareAccountId = await ask(
        rl,
        'Cloudflare Account ID: '
      );
    }

    return result;
  } finally {
    rl.close();
  }
}
