/**
 * Tools: upload_metadata, set_changelog, set_age_rating
 * Fastlane CLI wrappers for app metadata management.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runFastlaneAction,
  compactParams,
  DELIVER_SKIP_DEFAULTS,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import { handleToolCall } from '../exec/errors.js';

const METADATA_FIELDS = [
  'name', 'subtitle', 'description', 'keywords',
  'promotional_text', 'release_notes', 'privacy_url',
  'support_url', 'marketing_url',
] as const;

/** Create temp metadata directory tree for deliver. */
async function createMetadataDir(
  metadata: Record<string, string | undefined>,
  languages: string[],
): Promise<string> {
  const baseDir = join(tmpdir(), `fastlane-mcp-${randomUUID()}`);

  for (const lang of languages) {
    const langDir = join(baseDir, 'fastlane', 'metadata', lang);
    await mkdir(langDir, { recursive: true });

    for (const field of METADATA_FIELDS) {
      const value = metadata[field];
      if (value !== undefined) {
        await writeFile(join(langDir, `${field}.txt`), value);
      }
    }
  }

  return baseDir;
}

export function registerMetadataTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
): void {
  server.tool(
    'upload_metadata',
    'Upload app metadata (name, description, etc.) via fastlane deliver.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      app_version: z.string().describe('Version string (e.g. 1.0.0)'),
      metadata: z.object({
        name: z.string().optional(),
        subtitle: z.string().optional(),
        description: z.string().optional(),
        keywords: z.string().optional(),
        promotional_text: z.string().optional(),
        release_notes: z.string().optional(),
        privacy_url: z.string().optional(),
        support_url: z.string().optional(),
        marketing_url: z.string().optional(),
      }).describe('Metadata fields to upload'),
      languages: z.array(z.string()).optional().describe(
        'Locale codes (default: ["en-US"])',
      ),
      copyright: z.string().optional().describe('Copyright string'),
      primary_category: z.string().optional(),
      secondary_category: z.string().optional(),
      skip_binary_upload: z.boolean().optional().describe(
        'Skip binary upload (default: true)',
      ),
    },
    (params) => handleToolCall(async () => {
      const langs = params.languages ?? ['en-US'];
      const tempDir = await createMetadataDir(params.metadata, langs);

      try {
        const output = await runFastlaneAction(config, {
          action: 'deliver',
          params: compactParams({
            app_identifier: params.app_identifier,
            app_version: params.app_version,
            metadata_path: join(tempDir, 'fastlane', 'metadata'),
            skip_binary_upload: params.skip_binary_upload ?? true,
            skip_screenshots: true,
            skip_metadata: false,
            force: true,
            copyright: params.copyright,
            primary_category: params.primary_category,
            secondary_category: params.secondary_category,
          }),
        });
        return { message: 'Metadata uploaded successfully', output };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }),
  );

  server.tool(
    'set_changelog',
    'Set the "What\'s New" text for a specific app version.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      changelog: z.string().describe('What\'s New text'),
      version: z.string().optional().describe('Target version string'),
      platform: z.string().optional().describe('Platform: ios, osx'),
    },
    ({ app_identifier, changelog, version, platform }) =>
      handleToolCall(async () => {
        const output = await runFastlaneAction(config, {
          action: 'set_changelog',
          params: compactParams({
            app_identifier,
            changelog,
            version,
            platform,
          }),
        });
        return { message: 'Changelog updated', output };
      }),
  );

  server.tool(
    'set_age_rating',
    'Set age rating configuration via fastlane deliver.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      rating_config: z.record(z.union([z.string(), z.number(), z.boolean()]))
        .describe('Age rating config object'),
    },
    ({ app_identifier, rating_config }) =>
      handleToolCall(async () => {
        const tempPath = join(
          tmpdir(),
          `age-rating-${randomUUID()}.json`,
        );

        try {
          await writeFile(
            tempPath,
            JSON.stringify(rating_config, null, 2),
          );

          const output = await runFastlaneAction(config, {
            action: 'deliver',
            params: {
              ...DELIVER_SKIP_DEFAULTS,
              app_identifier,
              app_rating_config_path: tempPath,
            },
          });
          return { message: 'Age rating updated', output };
        } finally {
          await rm(tempPath, { force: true });
        }
      }),
  );
}
