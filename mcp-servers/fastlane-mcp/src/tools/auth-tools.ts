/**
 * Tool: configure_api_key
 * Configure App Store Connect API authentication from a P8 key file.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { configureApiKey } from '../auth/api-key.js';
import { handleToolCall } from '../exec/errors.js';

export function registerAuthTools(server: McpServer): void {
  server.tool(
    'configure_api_key',
    'Configure App Store Connect API auth from a P8 key file. '
    + 'Parses key_id/issuer_id from filename pattern '
    + 'name(key_id_XXX_issuer_YYY_vendor_id_ZZZ).p8 '
    + 'or accepts them as explicit parameters.',
    {
      key_filepath: z.string().describe(
        'Path to the .p8 private key file',
      ),
      key_id: z.string().optional().describe(
        'API Key ID (parsed from filename if omitted)',
      ),
      issuer_id: z.string().optional().describe(
        'Issuer ID (parsed from filename if omitted)',
      ),
      in_house: z.boolean().optional().describe(
        'Set true for Apple Developer Enterprise accounts',
      ),
    },
    ({ key_filepath, key_id, issuer_id, in_house }) =>
      handleToolCall(async () => {
        const result = await configureApiKey({
          keyFilepath: key_filepath,
          keyId: key_id,
          issuerId: issuer_id,
          inHouse: in_house,
        });
        return {
          message: 'API key configured successfully',
          keyId: result.keyId,
          issuerId: result.issuerId,
        };
      }),
  );
}
