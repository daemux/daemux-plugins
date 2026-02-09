/**
 * Codemagic Artifact management tools (Legacy API).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LegacyClient } from '../api/legacy-client.js';
import { handleToolCall } from '../api/errors.js';

export function registerArtifactTools(server: McpServer, legacy: LegacyClient): void {
  server.tool(
    'get_artifact_url',
    'Get the download URL for a build artifact',
    {
      secureFilename: z.string().describe('Secure filename of the artifact'),
    },
    ({ secureFilename }) => handleToolCall(() =>
      legacy.get(`/artifacts/${encodeURIComponent(secureFilename)}`),
    ),
  );

  server.tool(
    'create_public_artifact_url',
    'Create a time-limited public URL for a build artifact',
    {
      secureFilename: z.string().describe('Secure filename of the artifact'),
      expiresAt: z.number().int().describe('Expiration as UNIX timestamp in seconds'),
    },
    ({ secureFilename, expiresAt }) => handleToolCall(() =>
      legacy.post(
        `/artifacts/${encodeURIComponent(secureFilename)}/public-url`,
        { expiresAt },
      ),
    ),
  );
}
