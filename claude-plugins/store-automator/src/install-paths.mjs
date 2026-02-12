import { execSync, execFileSync } from 'node:child_process';
import { installGitHubActionsTemplates, installMatchfile } from './templates.mjs';
import { findAppByRepo, addApp, normalizeRepoUrl } from './codemagic-api.mjs';
import {
  writeCiAppId, writeCiTeamId, writeMatchConfig, readFlutterRoot,
} from './ci-config.mjs';
import { updateMcpAppId, updateMcpTeamId } from './mcp-setup.mjs';

function setupGitHubActionsSecret(codemagicToken) {
  if (!codemagicToken) return false;

  try {
    execFileSync('which', ['gh'], { encoding: 'utf8', stdio: 'pipe' });
    const authStatus = execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe' });
    if (authStatus.includes('not logged')) return false;

    execFileSync('gh', ['secret', 'set', 'CM_API_TOKEN', '--body', codemagicToken], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

async function setupCodemagicApp(projectDir, codemagicToken, codemagicTeamId) {
  if (!codemagicToken) return;

  let repoUrl;
  try {
    const raw = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!raw) return;
    repoUrl = normalizeRepoUrl(raw);
  } catch {
    return;
  }

  try {
    let app = await findAppByRepo(codemagicToken, repoUrl);
    if (!app) {
      app = await addApp(codemagicToken, repoUrl, codemagicTeamId);
      console.log(`Codemagic app created: ${app.appName || app._id}`);
    } else {
      console.log(`Codemagic app found: ${app.appName || app._id}`);
    }

    const written = writeCiAppId(projectDir, app._id);
    if (written) {
      console.log(`Codemagic app_id written to ci.config.yaml`);
    }

    updateMcpAppId(projectDir, app._id);

    if (codemagicTeamId) {
      writeCiTeamId(projectDir, codemagicTeamId);
      updateMcpTeamId(projectDir, codemagicTeamId);
    }
  } catch (err) {
    console.log(`Codemagic auto-setup skipped: ${err.message || err}`);
  }
}

export function installGitHubActionsPath(projectDir, packageDir, cliTokens) {
  console.log('Configuring GitHub Actions mode...');
  installGitHubActionsTemplates(projectDir, packageDir);

  const flutterRoot = readFlutterRoot(projectDir);
  installMatchfile(projectDir, packageDir, flutterRoot, {
    matchGitUrl: cliTokens.matchGitUrl,
    bundleId: cliTokens.bundleId,
  });

  const wrote = writeMatchConfig(projectDir, {
    deployKeyPath: cliTokens.matchDeployKey,
    gitUrl: cliTokens.matchGitUrl,
  });
  if (wrote) console.log('Match credentials written to ci.config.yaml');
}

export async function installCodemagicPath(projectDir, tokens) {
  await setupCodemagicApp(projectDir, tokens.codemagicToken, tokens.codemagicTeamId);

  const ghConfigured = setupGitHubActionsSecret(tokens.codemagicToken);
  if (ghConfigured) {
    console.log('GitHub Actions: CM_API_TOKEN secret configured.');
  } else if (tokens.codemagicToken) {
    console.log('GitHub Actions: secret not set (gh CLI unavailable or not authenticated).');
  }
}
