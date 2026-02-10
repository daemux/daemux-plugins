const BASE_URL = 'https://api.codemagic.io';

async function cmFetch(token, method, path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'x-auth-token': token,
    'Content-Type': 'application/json',
  };

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}.`);
  }

  if (response.status === 401) {
    throw new Error('Authentication failed. Check your CM_API_TOKEN.');
  }
  if (response.status === 403) {
    throw new Error('Permission denied. Check API token permissions.');
  }
  if (response.status >= 500) {
    throw new Error(`Codemagic API error (${response.status}). Try again later.`);
  }
  if (!response.ok) {
    throw new Error(`Codemagic API error (${response.status}).`);
  }

  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

export async function listApps(token) {
  const data = await cmFetch(token, 'GET', '/apps');
  return data.applications || [];
}

export async function findAppByRepo(token, repoUrl) {
  const apps = await listApps(token);
  const normalized = normalizeRepoUrl(repoUrl);
  return apps.find((app) => {
    const appRepo = app.repository?.url || app.repositoryUrl || '';
    return normalizeRepoUrl(appRepo) === normalized;
  }) || null;
}

export async function addApp(token, repoUrl) {
  return cmFetch(token, 'POST', '/apps', { repositoryUrl: repoUrl });
}

export async function startBuild(token, appId, workflowId, branch) {
  return cmFetch(token, 'POST', '/builds', { appId, workflowId, branch });
}

export async function getBuildStatus(token, buildId) {
  const data = await cmFetch(token, 'GET', `/builds/${buildId}`);
  return data.build || data;
}

export function normalizeRepoUrl(url) {
  return url
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}
