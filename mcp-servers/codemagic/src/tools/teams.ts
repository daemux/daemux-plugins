/**
 * Codemagic Team and User management tools (V3 API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { V3Client } from '../api/v3-client.js';
import { handleToolCall, resolveTeamId } from '../api/errors.js';
import type { CmUser, CmTeam, CmTeamMember } from '../types/api-types.js';

export function registerTeamTools(server: McpServer, v3: V3Client, defaultTeamId?: string): void {
  server.tool(
    'get_user',
    'Get the current authenticated user info',
    {},
    () => handleToolCall(() => v3.get<CmUser>('/user')),
  );

  server.tool(
    'list_teams',
    'List all teams the current user belongs to',
    {},
    () => handleToolCall(() => v3.get<CmTeam[]>('/user/teams')),
  );

  server.tool(
    'get_team',
    'Get details of a specific team',
    { teamId: z.string().optional().describe('Team ID (uses default if omitted)') },
    ({ teamId }) => handleToolCall(() => {
      const resolved = resolveTeamId(teamId, defaultTeamId);
      return v3.get<CmTeam>(`/teams/${encodeURIComponent(resolved)}`);
    }),
  );

  server.tool(
    'list_team_members',
    'List members of a specific team',
    { teamId: z.string().optional().describe('Team ID (uses default if omitted)') },
    ({ teamId }) => handleToolCall(() => {
      const resolved = resolveTeamId(teamId, defaultTeamId);
      return v3.get<CmTeamMember[]>(
        `/teams/${encodeURIComponent(resolved)}/members`,
      );
    }),
  );
}
