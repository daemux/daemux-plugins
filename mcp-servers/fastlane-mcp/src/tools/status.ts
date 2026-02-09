/**
 * Tools: get_app_status, list_app_versions
 * ASC API wrappers for querying app info and version history.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ascGet, type AscClientConfig } from '../exec/asc-client.js';
import { handleToolCall } from '../exec/errors.js';
import type {
  AscResponse,
  AscListResponse,
  AppAttributes,
  AppVersionAttributes,
} from '../types/asc-api-types.js';

export function registerStatusTools(
  server: McpServer,
  ascConfig: AscClientConfig,
): void {
  server.tool(
    'get_app_status',
    'Get app information and current status from App Store Connect.',
    {
      app_id: z.string().describe('App Store Connect app ID'),
    },
    ({ app_id }) => handleToolCall(async () => {
      const resp = await ascGet<AscResponse<AppAttributes>>(
        ascConfig,
        `/v1/apps/${encodeURIComponent(app_id)}`,
      );
      return resp.data;
    }),
  );

  server.tool(
    'list_app_versions',
    'List all app versions with their App Store states.',
    {
      app_id: z.string().describe('App Store Connect app ID'),
      platform: z.string().optional().describe(
        'Filter by platform: IOS, MAC_OS, TV_OS',
      ),
    },
    ({ app_id, platform }) => handleToolCall(async () => {
      let path = `/v1/apps/${encodeURIComponent(app_id)}`
        + '/appStoreVersions';
      if (platform) {
        path += `?filter[platform]=${encodeURIComponent(platform)}`;
      }

      const resp = await ascGet<AscListResponse<AppVersionAttributes>>(
        ascConfig,
        path,
      );
      return resp.data;
    }),
  );
}
