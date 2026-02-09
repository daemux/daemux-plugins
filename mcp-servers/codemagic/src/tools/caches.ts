/**
 * Codemagic Build Cache management tools (Legacy API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LegacyClient } from '../api/legacy-client.js';
import { handleToolCall } from '../api/errors.js';
import type { CmCache } from '../types/api-types.js';

export function registerCacheTools(server: McpServer, legacy: LegacyClient): void {
  server.tool(
    'list_caches',
    'List build caches for an application',
    {
      appId: z.string().describe('Application ID'),
    },
    ({ appId }) => handleToolCall(() =>
      legacy.get<CmCache[]>(`/apps/${encodeURIComponent(appId)}/caches`),
    ),
  );

  server.tool(
    'delete_caches',
    'Delete build caches for an application (all or a specific cache)',
    {
      appId: z.string().describe('Application ID'),
      cacheId: z.string().optional().describe('Specific cache ID to delete (omit to delete all)'),
    },
    ({ appId, cacheId }) => handleToolCall(async () => {
      const appPath = encodeURIComponent(appId);
      const path = cacheId
        ? `/apps/${appPath}/caches/${encodeURIComponent(cacheId)}`
        : `/apps/${appPath}/caches`;

      await legacy.delete(path);
      return { deleted: true, appId, ...(cacheId ? { cacheId } : { all: true }) };
    }),
  );
}
