/**
 * Codemagic Variable Group management tools (V3 API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { V3Client } from '../api/v3-client.js';
import { handleToolCall, resolveTeamId } from '../api/errors.js';
import type { CmVariableGroup } from '../types/api-types.js';

export function registerVariableGroupTools(
  server: McpServer, v3: V3Client, defaultAppId?: string, defaultTeamId?: string,
): void {
  server.tool(
    'list_variable_groups',
    'List variable groups for a team or application',
    {
      teamId: z.string().optional().describe('Team ID (provide teamId or appId)'),
      appId: z.string().optional().describe('Application ID (provide teamId or appId, uses default if both omitted)'),
    },
    ({ teamId, appId }) => handleToolCall(() => {
      const resolvedTeamId = teamId ?? defaultTeamId;
      const resolvedAppId = appId ?? defaultAppId;
      if (!resolvedTeamId && !resolvedAppId) {
        throw new Error('Provide either teamId or appId (no default configured)');
      }

      const path = resolvedTeamId
        ? `/teams/${encodeURIComponent(resolvedTeamId)}/variable-groups`
        : `/apps/${encodeURIComponent(resolvedAppId!)}/variable-groups`;

      return v3.get<CmVariableGroup[]>(path);
    }),
  );

  server.tool(
    'get_variable_group',
    'Get details of a specific variable group',
    {
      variableGroupId: z.string().describe('Variable group ID'),
    },
    ({ variableGroupId }) => handleToolCall(() =>
      v3.get<CmVariableGroup>(
        `/variable-groups/${encodeURIComponent(variableGroupId)}`,
      ),
    ),
  );

  server.tool(
    'create_variable_group',
    'Create a new variable group',
    {
      teamId: z.string().optional().describe('Team ID to create the group in (uses default if omitted)'),
      name: z.string().describe('Variable group name'),
      advancedSecurity: z.boolean().optional().describe('Enable advanced security'),
      variables: z.array(z.object({
        name: z.string().describe('Variable name'),
        value: z.string().describe('Variable value'),
        secure: z.boolean().optional().describe('Mark as secure variable'),
      })).optional().describe('Initial variables to add'),
    },
    ({ teamId, name, advancedSecurity, variables }) => handleToolCall(async () => {
      const resolved = resolveTeamId(teamId, defaultTeamId);
      const body: Record<string, unknown> = {
        name,
        advanced_security: {
          enabled: advancedSecurity ?? false,
          selected_apps: [],
        },
      };

      const group = await v3.post<CmVariableGroup>(
        `/teams/${encodeURIComponent(resolved)}/variable-groups`,
        body,
      );

      if (variables && variables.length > 0) {
        const secure = variables.some((v) => v.secure);
        const apiVars = variables.map(({ name: n, value }) => ({ name: n, value }));
        await v3.post(
          `/variable-groups/${encodeURIComponent(group.id)}/variables`,
          { variables: apiVars, secure },
        );
      }

      return v3.get<CmVariableGroup>(
        `/variable-groups/${encodeURIComponent(group.id)}`,
      );
    }),
  );

  server.tool(
    'update_variable_group',
    'Update a variable group name or security setting',
    {
      variableGroupId: z.string().describe('Variable group ID'),
      name: z.string().optional().describe('New name'),
      advancedSecurity: z.boolean().optional().describe('Enable/disable advanced security'),
    },
    ({ variableGroupId, name, advancedSecurity }) => handleToolCall(() => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (advancedSecurity !== undefined) {
        body.advanced_security = {
          enabled: advancedSecurity,
          selected_apps: [],
        };
      }

      return v3.patch<CmVariableGroup>(
        `/variable-groups/${encodeURIComponent(variableGroupId)}`,
        body,
      );
    }),
  );

  server.tool(
    'delete_variable_group',
    'Delete a variable group',
    {
      variableGroupId: z.string().describe('Variable group ID to delete'),
    },
    ({ variableGroupId }) => handleToolCall(async () => {
      await v3.delete(
        `/variable-groups/${encodeURIComponent(variableGroupId)}`,
      );
      return { deleted: true, variableGroupId };
    }),
  );
}
