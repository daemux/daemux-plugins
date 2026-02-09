/**
 * Tool: create_iap
 * Create In-App Purchase via ASC API (POST /v2/inAppPurchases).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ascPost, type AscClientConfig } from '../exec/asc-client.js';
import { handleToolCall } from '../exec/errors.js';
import type { AscResponse, IapAttributes, IapCreateBody } from '../types/asc-api-types.js';

const IAP_TYPES = [
  'CONSUMABLE',
  'NON_CONSUMABLE',
  'NON_RENEWING_SUBSCRIPTION',
] as const;

export function registerIapTools(
  server: McpServer,
  ascConfig: AscClientConfig,
): void {
  server.tool(
    'create_iap',
    'Create an In-App Purchase on App Store Connect via the REST API.',
    {
      app_id: z.string().describe(
        'App Store Connect app ID (numeric string)',
      ),
      product_id: z.string().describe(
        'IAP product identifier (e.g. com.example.coins100)',
      ),
      reference_name: z.string().describe(
        'Internal reference name for the IAP',
      ),
      type: z.enum(IAP_TYPES).describe('IAP type'),
      review_note: z.string().optional().describe(
        'Note for App Review team',
      ),
      family_sharable: z.boolean().optional().describe(
        'Allow Family Sharing for this IAP',
      ),
    },
    ({ app_id, product_id, reference_name, type, review_note, family_sharable }) =>
      handleToolCall(async () => {
        const body: IapCreateBody = {
          data: {
            type: 'inAppPurchases',
            attributes: {
              productId: product_id,
              referenceName: reference_name,
              inAppPurchaseType: type,
            },
            relationships: {
              app: { data: { type: 'apps', id: app_id } },
            },
          },
        };

        if (review_note !== undefined) {
          body.data.attributes.reviewNote = review_note;
        }
        if (family_sharable !== undefined) {
          body.data.attributes.familySharable = family_sharable;
        }

        return ascPost<AscResponse<IapAttributes>>(
          ascConfig,
          '/v2/inAppPurchases',
          body,
        );
      }),
  );
}
