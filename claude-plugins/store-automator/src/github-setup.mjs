import { exec } from './utils.mjs';
import { execFileSync } from 'child_process';

function resolveToken(tokenArg) {
  const token = process.env.CM_API_TOKEN || tokenArg;
  if (!token) {
    console.error('Codemagic API token required. Set CM_API_TOKEN or pass --token=...');
    process.exit(1);
  }
  return token;
}

function checkGhCli() {
  const ghPath = exec('which gh');
  if (!ghPath) {
    console.error('GitHub CLI (gh) is required but not found.');
    console.error('Install it: https://cli.github.com/');
    process.exit(1);
  }

  const authStatus = exec('gh auth status 2>&1');
  if (!authStatus || authStatus.includes('not logged')) {
    console.error('GitHub CLI is not authenticated. Run: gh auth login');
    process.exit(1);
  }
}

function setGitHubSecret(name, value) {
  try {
    execFileSync('gh', ['secret', 'set', name, '--body', value], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  Secret ${name} set successfully.`);
  } catch (err) {
    console.error(`Failed to set GitHub secret: ${name}`);
    if (err.stderr) console.error(err.stderr.trim());
    process.exit(1);
  }
}

export async function runGitHubSetup(options) {
  checkGhCli();
  const token = resolveToken(options.tokenArg);

  console.log('Configuring GitHub repository secret...');
  setGitHubSecret('CM_API_TOKEN', token);

  console.log('\nGitHub Actions setup complete.');
  console.log('Next: Fill codemagic.app_id in ci.config.yaml.');
  console.log('GitHub Actions will trigger configured Codemagic workflows on push to main.');
}
