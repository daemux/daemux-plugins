/**
 * Tools: set_publishing_mode, submit_for_review
 * Fastlane CLI wrappers for app publishing and submission.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  runFastlaneAction,
  compactParams,
  DELIVER_SKIP_DEFAULTS,
  type FastlaneRunnerConfig,
} from '../exec/fastlane-runner.js';
import { handleToolCall } from '../exec/errors.js';

export function registerPublishingTools(
  server: McpServer,
  config: FastlaneRunnerConfig,
): void {
  server.tool(
    'set_publishing_mode',
    'Set the app release mode (automatic, manual, or phased).',
    {
      app_identifier: z.string().describe('Bundle ID'),
      automatic_release: z.boolean().optional().describe(
        'Automatically release after approval',
      ),
      auto_release_date: z.string().optional().describe(
        'Scheduled release date (ISO 8601)',
      ),
      phased_release: z.boolean().optional().describe(
        'Enable phased release over 7 days',
      ),
    },
    ({ app_identifier, automatic_release, auto_release_date, phased_release }) =>
      handleToolCall(async () => {
        const output = await runFastlaneAction(config, {
          action: 'deliver',
          params: compactParams({
            ...DELIVER_SKIP_DEFAULTS,
            app_identifier,
            automatic_release,
            auto_release_date,
            phased_release,
          }),
        });
        return { message: 'Publishing mode updated', output };
      }),
  );

  server.tool(
    'submit_for_review',
    'Submit the app for App Store review via fastlane deliver.',
    {
      app_identifier: z.string().describe('Bundle ID'),
      submission_information: z.record(z.string()).optional().describe(
        'Submission info (export compliance, content rights, etc.)',
      ),
      app_review_information: z.record(z.string()).optional().describe(
        'Review contact info (first_name, last_name, phone, email, etc.)',
      ),
      reset_ratings: z.boolean().optional().describe(
        'Reset star ratings with this version',
      ),
    },
    (params) => handleToolCall(async () => {
      const output = await runFastlaneAction(config, {
        action: 'deliver',
        params: compactParams({
          ...DELIVER_SKIP_DEFAULTS,
          app_identifier: params.app_identifier,
          submit_for_review: true,
          submission_information: params.submission_information
            ? JSON.stringify(params.submission_information)
            : undefined,
          app_review_information: params.app_review_information
            ? JSON.stringify(params.app_review_information)
            : undefined,
          reset_ratings: params.reset_ratings,
        }),
      });
      return { message: 'App submitted for review', output };
    }),
  );
}
