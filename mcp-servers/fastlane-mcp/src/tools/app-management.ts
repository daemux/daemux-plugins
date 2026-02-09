/**
 * Tools: create_app, manage_app_services, precheck_app
 * Fastlane CLI wrappers for app lifecycle management.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runFastlaneAction,
  compactParams,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import { handleToolCall } from '../exec/errors.js';

export function registerAppManagementTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
): void {
  server.tool(
    'create_app',
    'Create a new app on App Store Connect via fastlane produce.',
    {
      app_identifier: z.string().describe('Bundle ID (e.g. com.example.app)'),
      app_name: z.string().describe('App name on App Store Connect'),
      sku: z.string().optional().describe('Unique SKU for the app'),
      app_version: z.string().optional().describe('Initial version string'),
      language: z.string().optional().describe(
        'Primary language (e.g. English)',
      ),
      company_name: z.string().optional().describe('Company name'),
      platform: z.string().optional().describe('Platform: ios, osx'),
      enable_services: z.record(z.string()).optional().describe(
        'Services to enable (e.g. { push_notification: "on" })',
      ),
    },
    (params) => handleToolCall(async () => {
      const output = await runFastlaneAction(config, {
        action: 'produce',
        params: compactParams({
          app_identifier: params.app_identifier,
          app_name: params.app_name,
          sku: params.sku,
          app_version: params.app_version,
          language: params.language,
          company_name: params.company_name,
          platform: params.platform,
          enable_services: params.enable_services
            ? JSON.stringify(params.enable_services)
            : undefined,
        }),
      });
      return { message: 'App created successfully', output };
    }),
  );

  server.tool(
    'manage_app_services',
    'Enable or disable app services via fastlane produce.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      enable_services: z.record(z.string()).describe(
        'Services map (e.g. { push_notification: "on", icloud: "cloudkit" })',
      ),
    },
    ({ app_identifier, enable_services }) =>
      handleToolCall(async () => {
        const output = await runFastlaneAction(config, {
          action: 'produce',
          params: {
            app_identifier,
            enable_services: JSON.stringify(enable_services),
          },
        });
        return { message: 'App services updated', output };
      }),
  );

  server.tool(
    'precheck_app',
    'Run fastlane precheck to validate app metadata before submission.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      default_rule_level: z.string().optional().describe(
        'Rule level: error, warn, skip',
      ),
      include_in_app_purchases: z.boolean().optional().describe(
        'Include IAP metadata in checks',
      ),
    },
    ({ app_identifier, default_rule_level, include_in_app_purchases }) =>
      handleToolCall(async () => {
        const output = await runFastlaneAction(config, {
          action: 'precheck',
          params: compactParams({
            app_identifier,
            default_rule_level,
            include_in_app_purchases,
          }),
        });
        return { message: 'Precheck completed', output };
      }),
  );
}
