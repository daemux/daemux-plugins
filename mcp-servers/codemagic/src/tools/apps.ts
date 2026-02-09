/**
 * Codemagic Application management tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LegacyClient } from '../api/legacy-client.js';
import { handleToolCall } from '../api/errors.js';
import type { CmApp, CmAppsResponse } from '../types/api-types.js';

export function registerAppTools(server: McpServer, legacy: LegacyClient): void {
  server.tool(
    'list_apps',
    'List all Codemagic applications',
    {},
    () => handleToolCall(async () => {
      const data = await legacy.get<CmAppsResponse>('/apps');
      return data.applications;
    }),
  );

  server.tool(
    'get_app',
    'Get details of a specific Codemagic application',
    { appId: z.string().describe('The application ID') },
    ({ appId }) => handleToolCall(() =>
      legacy.get<CmApp>(`/apps/${encodeURIComponent(appId)}`),
    ),
  );

  server.tool(
    'add_app',
    'Add a new application to Codemagic',
    {
      repositoryUrl: z.string().describe('Git repository URL'),
      teamId: z.string().optional().describe('Team ID to add the app to'),
      projectType: z.string().optional().describe('Project type (e.g. flutter-app, react-native-app)'),
      sshKey: z.object({
        data: z.string().describe('SSH private key data'),
        passphrase: z.string().optional().describe('SSH key passphrase'),
      }).optional().describe('SSH key for private repository access'),
    },
    ({ repositoryUrl, teamId, projectType, sshKey }) => handleToolCall(() => {
      const body: Record<string, unknown> = { repositoryUrl };
      if (teamId) body.teamId = teamId;
      if (projectType) body.projectType = projectType;

      if (sshKey) {
        body.sshKey = sshKey;
        return legacy.post('/apps/new', body);
      }
      return legacy.post('/apps', body);
    }),
  );
}
