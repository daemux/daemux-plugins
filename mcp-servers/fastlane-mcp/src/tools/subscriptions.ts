/**
 * Tools: create_subscription, set_subscription_pricing, get_shared_secret
 * ASC API wrappers for subscription management.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ascGet,
  ascPost,
  type AscClientConfig,
} from '../exec/asc-client.js';
import { handleToolCall } from '../exec/errors.js';
import type {
  AscResponse,
  SubscriptionGroupAttributes,
  SubscriptionAttributes,
  SubscriptionGroupCreateBody,
  SubscriptionCreateBody,
  SubscriptionPriceCreateBody,
  SubscriptionPriceAttributes,
} from '../types/asc-api-types.js';

export function registerSubscriptionTools(
  server: McpServer,
  ascConfig: AscClientConfig,
): void {
  server.tool(
    'create_subscription',
    'Create a subscription group (if needed) and a subscription '
    + 'via the ASC REST API.',
    {
      app_id: z.string().describe('App Store Connect app ID'),
      group_name: z.string().describe('Subscription group name'),
      group_id: z.string().optional().describe(
        'Existing group ID (creates new group if omitted)',
      ),
      product_id: z.string().describe(
        'Subscription product identifier',
      ),
      reference_name: z.string().describe('Internal reference name'),
      subscription_period: z.string().describe(
        'Period: ONE_WEEK, ONE_MONTH, TWO_MONTHS, THREE_MONTHS, '
        + 'SIX_MONTHS, ONE_YEAR',
      ),
      review_note: z.string().optional().describe(
        'Note for App Review',
      ),
      family_sharable: z.boolean().optional().describe(
        'Allow Family Sharing',
      ),
    },
    (params) => handleToolCall(async () => {
      let groupId = params.group_id;

      if (!groupId) {
        const groupBody: SubscriptionGroupCreateBody = {
          data: {
            type: 'subscriptionGroups',
            attributes: { referenceName: params.group_name },
            relationships: {
              app: {
                data: { type: 'apps', id: params.app_id },
              },
            },
          },
        };

        const groupResp = await ascPost<
          AscResponse<SubscriptionGroupAttributes>
        >(ascConfig, '/v1/subscriptionGroups', groupBody);
        groupId = groupResp.data.id;
      }

      const subBody: SubscriptionCreateBody = {
        data: {
          type: 'subscriptions',
          attributes: {
            productId: params.product_id,
            referenceName: params.reference_name,
            subscriptionPeriod: params.subscription_period,
          },
          relationships: {
            group: {
              data: { type: 'subscriptionGroups', id: groupId },
            },
          },
        },
      };

      if (params.review_note !== undefined) {
        subBody.data.attributes.reviewNote = params.review_note;
      }
      if (params.family_sharable !== undefined) {
        subBody.data.attributes.familySharable = params.family_sharable;
      }

      const subResp = await ascPost<
        AscResponse<SubscriptionAttributes>
      >(ascConfig, '/v1/subscriptions', subBody);

      return {
        group_id: groupId,
        subscription: subResp.data,
      };
    }),
  );

  server.tool(
    'set_subscription_pricing',
    'Set base price and optional territory prices for a subscription.',
    {
      subscription_id: z.string().describe('Subscription resource ID'),
      base_territory: z.string().describe(
        'Base territory code (e.g. USA)',
      ),
      base_price: z.string().describe(
        'Base price point ID from price points API',
      ),
      prices: z.array(z.object({
        territory: z.string(),
        price_point: z.string(),
      })).optional().describe('Additional territory prices'),
    },
    ({ subscription_id, base_territory, base_price, prices }) =>
      handleToolCall(async () => {
        const allPrices = [
          { territory: base_territory, price_point: base_price },
          ...(prices ?? []),
        ];

        const results = [];
        for (const p of allPrices) {
          const body: SubscriptionPriceCreateBody = {
            data: {
              type: 'subscriptionPrices',
              attributes: { startDate: null },
              relationships: {
                territory: {
                  data: { type: 'territories', id: p.territory },
                },
                subscriptionPricePoint: {
                  data: {
                    type: 'subscriptionPricePoints',
                    id: p.price_point,
                  },
                },
              },
            },
          };

          const resp = await ascPost<
            AscResponse<SubscriptionPriceAttributes>
          >(
            ascConfig,
            `/v1/subscriptions/${encodeURIComponent(subscription_id)}/prices`,
            body,
          );
          results.push(resp.data);
        }

        return { prices_set: results.length, results };
      }),
  );

  server.tool(
    'get_shared_secret',
    'Look up an app in App Store Connect for receipt validation '
    + 'shared secret guidance. Note: the ASC REST API does not expose '
    + 'the shared secret directly; it must be retrieved from the '
    + 'App Store Connect web UI under App > App Information > '
    + 'App-Specific Shared Secret.',
    {
      app_id: z.string().describe('App Store Connect app ID'),
    },
    ({ app_id }) => handleToolCall(async () => {
      const path = `/v1/apps/${encodeURIComponent(app_id)}`;
      const resp = await ascGet<{
        data: {
          id: string;
          attributes: { name: string; bundleId: string };
        };
      }>(ascConfig, path);

      return {
        app: resp.data,
        shared_secret_info: {
          note: 'The App Store Connect REST API does not provide '
            + 'a direct endpoint for the app-specific shared secret. '
            + 'Retrieve it manually from the App Store Connect web UI: '
            + 'App > App Information > App-Specific Shared Secret.',
          web_url: `https://appstoreconnect.apple.com/apps/${encodeURIComponent(resp.data.id)}/appstore/info`,
        },
      };
    }),
  );
}
