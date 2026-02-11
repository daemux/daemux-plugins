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
    cliTokens.cloudflareAccountId !== undefined &&
    cliTokens.codemagicToken !== undefined
  );
}

export async function promptForTokens(cliTokens = {}) {
  const result = {
    stitchApiKey: cliTokens.stitchApiKey ?? '',
    cloudflareToken: cliTokens.cloudflareToken ?? '',
    cloudflareAccountId: cliTokens.cloudflareAccountId ?? '',
    codemagicToken: cliTokens.codemagicToken ?? '',
  };

  if (allTokensProvided(cliTokens)) {
    console.log('All MCP tokens provided via CLI flags, skipping prompts.');
    return result;
  }

  if (!isInteractive()) {
    console.log('Non-interactive terminal detected, skipping token prompts.');
    console.log('Run "npx store-automator" manually to configure MCP tokens.');
    return result;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log('MCP Server Configuration');
  console.log('Press Enter to skip any token you do not have yet.');
  console.log('');

  try {
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

    if (cliTokens.codemagicToken === undefined) {
      result.codemagicToken = await ask(
        rl,
        'Codemagic API Token (CM_API_TOKEN for CI/CD builds): '
      );
    }

    return result;
  } finally {
    rl.close();
  }
}
