#!/usr/bin/env node
/**
 * Codemagic CI/CD MCP Server
 * Provides 26 tools across 8 domains for managing Codemagic apps, builds,
 * variables, teams, artifacts, caches, and code signing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LegacyClient } from './api/legacy-client.js';
import { V3Client } from './api/v3-client.js';
import { registerAppTools } from './tools/apps.js';
import { registerBuildTools } from './tools/builds.js';
import { registerVariableGroupTools } from './tools/variables.js';
import { registerVariableItemTools } from './tools/variable-items.js';
import { registerTeamTools } from './tools/teams.js';
import { registerArtifactTools } from './tools/artifacts.js';
import { registerCacheTools } from './tools/caches.js';
import { registerCodeSigningTools } from './tools/code-signing.js';

const token = process.env.CODEMAGIC_API_TOKEN;
if (!token) {
  process.stderr.write('CODEMAGIC_API_TOKEN environment variable is required\n');
  process.exit(1);
}

const defaultAppId = process.env.CODEMAGIC_APP_ID || undefined;
const defaultTeamId = process.env.CODEMAGIC_TEAM_ID || undefined;

const server = new McpServer({ name: 'codemagic', version: '0.3.0' });
const legacy = new LegacyClient(token);
const v3 = new V3Client(token);

registerAppTools(server, legacy, defaultAppId, defaultTeamId);
registerBuildTools(server, legacy, v3, defaultAppId, defaultTeamId);
registerVariableGroupTools(server, v3, defaultAppId, defaultTeamId);
registerVariableItemTools(server, v3);
registerTeamTools(server, v3, defaultTeamId);
registerArtifactTools(server, legacy);
registerCacheTools(server, legacy, defaultAppId);
registerCodeSigningTools(server, v3, defaultTeamId);

const transport = new StdioServerTransport();
await server.connect(transport);
