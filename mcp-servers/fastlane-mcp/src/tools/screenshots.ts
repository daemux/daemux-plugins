/**
 * Tool: upload_screenshots
 * Upload screenshots to App Store Connect via fastlane deliver.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runScreenshotAction,
  compactParams,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import { handleToolCall } from '../exec/errors.js';

export function registerScreenshotTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
): void {
  server.tool(
    'upload_screenshots',
    'Upload screenshots to App Store Connect via fastlane deliver. '
    + 'Uses extended timeout (30 min) for large screenshot sets.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      screenshots_path: z.string().describe(
        'Path to screenshots directory structured by locale/device',
      ),
      overwrite_screenshots: z.boolean().optional().describe(
        'Overwrite existing screenshots (default: false)',
      ),
      screenshot_processing_timeout: z.number().optional().describe(
        'Processing timeout in seconds',
      ),
      languages: z.array(z.string()).optional().describe(
        'Locale codes to upload (uploads all found if omitted)',
      ),
    },
    (params) => handleToolCall(async () => {
      const output = await runScreenshotAction(config, {
        action: 'deliver',
        params: compactParams({
          app_identifier: params.app_identifier,
          screenshots_path: params.screenshots_path,
          skip_binary_upload: true,
          skip_metadata: true,
          force: true,
          overwrite_screenshots: params.overwrite_screenshots,
          screenshot_processing_timeout: params.screenshot_processing_timeout,
        }),
      });
      return { message: 'Screenshots uploaded successfully', output };
    }),
  );
}
