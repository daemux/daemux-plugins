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

export async function promptForTokens() {
  if (!isInteractive()) {
    console.log('Non-interactive terminal detected, skipping token prompts.');
    console.log('Run "npx store-automator" manually to configure MCP tokens.');
    return { stitchApiKey: '', cloudflareToken: '', cloudflareAccountId: '', codemagicToken: '' };
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
    const stitchApiKey = await ask(
      rl,
      'Stitch MCP API Key (STITCH_API_KEY value): '
    );

    const cloudflareToken = await ask(
      rl,
      'Cloudflare API Token: '
    );

    let cloudflareAccountId = '';
    if (cloudflareToken) {
      cloudflareAccountId = await ask(
        rl,
        'Cloudflare Account ID: '
      );
    }

    const codemagicToken = await ask(
      rl,
      'Codemagic API Token (CM_API_TOKEN for CI/CD builds): '
    );

    return { stitchApiKey, cloudflareToken, cloudflareAccountId, codemagicToken };
  } finally {
    rl.close();
  }
}
