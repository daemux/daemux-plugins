import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from './utils.mjs';

export function getMcpServers(tokens) {
  const servers = {
    playwright: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
    'mobile-mcp': {
      command: 'npx',
      args: ['-y', '@mobilenext/mobile-mcp@latest'],
    },
  };

  if (tokens.stitchApiKey) {
    servers.stitch = {
      command: 'npx',
      args: ['-y', '@_davideast/stitch-mcp', 'proxy'],
      env: { STITCH_API_KEY: tokens.stitchApiKey },
    };
  }

  if (tokens.cloudflareToken && tokens.cloudflareAccountId) {
    servers.cloudflare = {
      command: 'npx',
      args: ['-y', '@cloudflare/mcp-server-cloudflare', 'run', tokens.cloudflareAccountId],
      env: {
        CLOUDFLARE_API_TOKEN: tokens.cloudflareToken,
      },
    };
  }

  if (tokens.codemagicToken) {
    const codemagicEnv = { CODEMAGIC_API_TOKEN: tokens.codemagicToken };
    if (tokens.codemagicTeamId) codemagicEnv.CODEMAGIC_TEAM_ID = tokens.codemagicTeamId;
    if (tokens.codemagicAppId) codemagicEnv.CODEMAGIC_APP_ID = tokens.codemagicAppId;
    servers.codemagic = {
      command: 'npx',
      args: ['-y', '@daemux/codemagic-mcp@latest'],
      env: codemagicEnv,
    };
  }

  return servers;
}

function loadMcpJson(mcpPath) {
  if (!existsSync(mcpPath)) return { mcpServers: {} };
  try {
    const data = readJson(mcpPath);
    data.mcpServers ??= {};
    return data;
  } catch {
    return { mcpServers: {} };
  }
}

export function writeMcpJson(projectDir, servers) {
  const mcpPath = join(projectDir, '.mcp.json');
  const existing = loadMcpJson(mcpPath);

  const added = [];
  for (const [name, config] of Object.entries(servers)) {
    if (!(name in existing.mcpServers)) {
      existing.mcpServers[name] = config;
      added.push(name);
    }
  }

  writeJson(mcpPath, existing);

  if (added.length > 0) {
    console.log(`Added MCP servers: ${added.join(', ')}`);
  } else {
    console.log('All MCP servers already configured in .mcp.json');
  }
}

function updateMcpEnvVar(projectDir, envKey, value) {
  const mcpPath = join(projectDir, '.mcp.json');
  if (!existsSync(mcpPath)) return false;

  try {
    const data = readJson(mcpPath);
    if (!data.mcpServers?.codemagic?.env) return false;
    data.mcpServers.codemagic.env[envKey] = value;
    writeJson(mcpPath, data);
    return true;
  } catch {
    return false;
  }
}

export function updateMcpAppId(projectDir, appId) {
  return updateMcpEnvVar(projectDir, 'CODEMAGIC_APP_ID', appId);
}

export function updateMcpTeamId(projectDir, teamId) {
  return updateMcpEnvVar(projectDir, 'CODEMAGIC_TEAM_ID', teamId);
}

export function removeMcpServers(projectDir) {
  const mcpPath = join(projectDir, '.mcp.json');
  if (!existsSync(mcpPath)) return;

  try {
    const data = readJson(mcpPath);
    if (!data.mcpServers) return;

    const toRemove = ['playwright', 'mobile-mcp', 'stitch', 'cloudflare', 'codemagic'];
    for (const name of toRemove) {
      delete data.mcpServers[name];
    }

    if (Object.keys(data.mcpServers).length === 0) {
      delete data.mcpServers;
    }

    writeJson(mcpPath, data);
    console.log('Removed store-automator MCP servers from .mcp.json');
  } catch {
    // Silently skip if file is invalid
  }
}
