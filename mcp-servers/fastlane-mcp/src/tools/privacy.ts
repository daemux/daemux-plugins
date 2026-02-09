/**
 * Tools: upload_privacy_details, download_privacy_template
 * Fastlane CLI wrappers for App Privacy management.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runFastlaneAction,
  compactParams,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import { handleToolCall } from '../exec/errors.js';

export function registerPrivacyTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
): void {
  server.tool(
    'upload_privacy_details',
    'Upload app privacy details to App Store Connect.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      json_path: z.string().optional().describe(
        'Path to privacy JSON file on disk',
      ),
      privacy_json: z.record(z.unknown()).optional().describe(
        'Privacy details as inline JSON object (used if json_path not set)',
      ),
    },
    ({ app_identifier, json_path, privacy_json }) =>
      handleToolCall(async () => {
        let effectivePath = json_path;
        let tempPath: string | null = null;

        if (!effectivePath && privacy_json) {
          tempPath = join(
            tmpdir(),
            `privacy-${randomUUID()}.json`,
          );
          await writeFile(
            tempPath,
            JSON.stringify(privacy_json, null, 2),
          );
          effectivePath = tempPath;
        }

        try {
          const output = await runFastlaneAction(config, {
            action: 'upload_app_privacy_details_to_app_store',
            params: compactParams({
              app_identifier,
              json_path: effectivePath,
            }),
          });
          return { message: 'Privacy details uploaded', output };
        } finally {
          if (tempPath) {
            await rm(tempPath, { force: true });
          }
        }
      }),
  );

  server.tool(
    'download_privacy_template',
    'Download the app privacy details template from App Store Connect.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      output_path: z.string().optional().describe(
        'Directory to save the template (defaults to temp dir)',
      ),
    },
    ({ app_identifier, output_path }) =>
      handleToolCall(async () => {
        const outDir = output_path
          ?? join(tmpdir(), `privacy-template-${randomUUID()}`);

        const output = await runFastlaneAction(config, {
          action: 'download_app_privacy_details_from_app_store',
          params: { app_identifier, output_json_path: outDir },
        });
        return {
          message: 'Privacy template downloaded',
          output_path: outDir,
          output,
        };
      }),
  );
}
