/**
 * Codemagic individual Variable management tools (V3 API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { V3Client } from '../api/v3-client.js';
import { handleToolCall } from '../api/errors.js';
import type { CmVariable } from '../types/api-types.js';

function variablePath(groupId: string, variableId?: string): string {
  const base = `/variable-groups/${encodeURIComponent(groupId)}/variables`;
  return variableId ? `${base}/${encodeURIComponent(variableId)}` : base;
}

export function registerVariableItemTools(server: McpServer, v3: V3Client): void {
  server.tool(
    'list_variables',
    'List variables in a variable group',
    {
      variableGroupId: z.string().describe('Variable group ID'),
    },
    ({ variableGroupId }) => handleToolCall(() =>
      v3.get<CmVariable[]>(variablePath(variableGroupId)),
    ),
  );

  server.tool(
    'get_variable',
    'Get a specific variable from a variable group',
    {
      variableGroupId: z.string().describe('Variable group ID'),
      variableId: z.string().describe('Variable ID'),
    },
    ({ variableGroupId, variableId }) => handleToolCall(() =>
      v3.get<CmVariable>(variablePath(variableGroupId, variableId)),
    ),
  );

  server.tool(
    'update_variable',
    'Update a variable in a variable group',
    {
      variableGroupId: z.string().describe('Variable group ID'),
      variableId: z.string().describe('Variable ID'),
      name: z.string().optional().describe('New variable name'),
      value: z.string().optional().describe('New variable value'),
      secure: z.boolean().optional().describe('Mark as secure'),
    },
    ({ variableGroupId, variableId, name, value, secure }) => handleToolCall(() => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (value !== undefined) body.value = value;
      if (secure !== undefined) body.secure = secure;

      return v3.patch<CmVariable>(
        variablePath(variableGroupId, variableId),
        body,
      );
    }),
  );

  server.tool(
    'delete_variable',
    'Delete a variable from a variable group',
    {
      variableGroupId: z.string().describe('Variable group ID'),
      variableId: z.string().describe('Variable ID to delete'),
    },
    ({ variableGroupId, variableId }) => handleToolCall(async () => {
      await v3.delete(variablePath(variableGroupId, variableId));
      return { deleted: true, variableGroupId, variableId };
    }),
  );

  server.tool(
    'bulk_import_variables',
    'Import multiple variables into a variable group at once',
    {
      variableGroupId: z.string().describe('Variable group ID'),
      secure: z.boolean().describe('Mark all imported variables as secure'),
      variables: z.array(z.object({
        name: z.string().describe('Variable name'),
        value: z.string().describe('Variable value'),
      })).describe('Array of variables to import'),
    },
    ({ variableGroupId, secure, variables }) => handleToolCall(() =>
      v3.post(variablePath(variableGroupId), { secure, variables }),
    ),
  );
}
