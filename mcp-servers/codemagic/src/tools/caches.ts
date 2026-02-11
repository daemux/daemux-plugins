/**
 * Codemagic Build Cache management tools (Legacy API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LegacyClient } from '../api/legacy-client.js';
import { handleToolCall, resolveAppId } from '../api/errors.js';
import type { CmCache } from '../types/api-types.js';

export function registerCacheTools(server: McpServer, legacy: LegacyClient, defaultAppId?: string): void {
  server.tool(
    'list_caches',
    'List build caches for an application',
    {
      appId: z.string().optional().describe('Application ID (uses default if omitted)'),
    },
    ({ appId }) => handleToolCall(() =>
      legacy.get<CmCache[]>(`/apps/${encodeURIComponent(resolveAppId(appId, defaultAppId))}/caches`),
    ),
  );

  server.tool(
    'delete_caches',
    'Delete build caches for an application (all or a specific cache)',
    {
      appId: z.string().optional().describe('Application ID (uses default if omitted)'),
      cacheId: z.string().optional().describe('Specific cache ID to delete (omit to delete all)'),
    },
    ({ appId, cacheId }) => handleToolCall(async () => {
      const resolvedAppId = resolveAppId(appId, defaultAppId);
      const appPath = encodeURIComponent(resolvedAppId);
      const path = cacheId
        ? `/apps/${appPath}/caches/${encodeURIComponent(cacheId)}`
        : `/apps/${appPath}/caches`;

      await legacy.delete(path);
      return { deleted: true, appId: resolvedAppId, ...(cacheId ? { cacheId } : { all: true }) };
    }),
  );
}
