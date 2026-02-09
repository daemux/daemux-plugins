/**
 * Tool: set_app_price
 * Set app price tier via deliver + territory pricing via ASC API.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runFastlaneAction,
  DELIVER_SKIP_DEFAULTS,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import {
  ascGet,
  ascPost,
  type AscClientConfig,
} from '../exec/asc-client.js';
import { handleToolCall } from '../exec/errors.js';

export function registerPricingTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
  ascConfig: AscClientConfig,
): void {
  server.tool(
    'set_app_price',
    'Set app price tier via fastlane deliver. Optionally set '
    + 'territory-specific pricing via the ASC API.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      price_tier: z.number().describe('Price tier number (0 = free)'),
      territories: z.array(z.object({
        territory: z.string().describe('Territory code (e.g. USA)'),
        price_point_id: z.string().describe('Price point resource ID'),
      })).optional().describe(
        'Territory-specific pricing via ASC API',
      ),
    },
    ({ app_identifier, price_tier, territories }) =>
      handleToolCall(async () => {
        const output = await runFastlaneAction(config, {
          action: 'deliver',
          params: {
            ...DELIVER_SKIP_DEFAULTS,
            app_identifier,
            price_tier,
          },
        });

        const territoryResults: unknown[] = [];

        if (territories?.length) {
          const appsResp = await ascGet<{
            data: { id: string; attributes: { bundleId: string } }[];
          }>(
            ascConfig,
            `/v1/apps?filter[bundleId]=${encodeURIComponent(app_identifier)}`,
          );

          const appId = appsResp.data[0]?.id;
          if (appId) {
            for (const t of territories) {
              const resp = await ascPost(
                ascConfig,
                `/v1/apps/${encodeURIComponent(appId)}/appPriceSchedules`,
                {
                  data: {
                    type: 'appPriceSchedules',
                    relationships: {
                      baseTerritory: {
                        data: {
                          type: 'territories',
                          id: t.territory,
                        },
                      },
                      manualPrices: {
                        data: [{
                          type: 'appPrices',
                          id: t.price_point_id,
                        }],
                      },
                    },
                  },
                },
              );
              territoryResults.push(resp);
            }
          }
        }

        return {
          message: 'Price set successfully',
          deliver_output: output,
          territory_pricing: territoryResults,
        };
      }),
  );
}
