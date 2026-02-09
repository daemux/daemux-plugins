/**
 * Codemagic Build management tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LegacyClient } from '../api/legacy-client.js';
import type { V3Client } from '../api/v3-client.js';
import { handleToolCall } from '../api/errors.js';
import type { CmBuild, V3BuildsResponse } from '../types/api-types.js';

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}

export function registerBuildTools(
  server: McpServer,
  legacy: LegacyClient,
  v3: V3Client,
): void {
  server.tool(
    'start_build',
    'Start a new build on Codemagic',
    {
      appId: z.string().describe('Application ID'),
      workflowId: z.string().describe('Workflow ID to run'),
      branch: z.string().optional().describe('Git branch to build'),
      tag: z.string().optional().describe('Git tag to build'),
      environment: z.record(z.string()).optional().describe('Environment variables'),
      labels: z.array(z.string()).optional().describe('Build labels'),
      instanceType: z.string().optional().describe('Build machine type'),
    },
    ({ appId, workflowId, branch, tag, environment, labels, instanceType }) =>
      handleToolCall(() =>
        legacy.post<CmBuild>('/builds', stripUndefined({
          appId, workflowId, branch, tag, environment, labels, instanceType,
        })),
      ),
  );

  server.tool(
    'get_build',
    'Get details of a specific build',
    { buildId: z.string().describe('Build ID') },
    ({ buildId }) => handleToolCall(() =>
      legacy.get<CmBuild>(`/builds/${encodeURIComponent(buildId)}`),
    ),
  );

  server.tool(
    'cancel_build',
    'Cancel a running build',
    { buildId: z.string().describe('Build ID to cancel') },
    ({ buildId }) => handleToolCall(async () => {
      const result = await legacy.post(
        `/builds/${encodeURIComponent(buildId)}/cancel`,
      );
      return result ?? { cancelled: true };
    }),
  );

  server.tool(
    'list_builds',
    'List builds for a team (V3 API)',
    {
      teamId: z.string().describe('Team ID'),
      appId: z.string().optional().describe('Filter by application ID'),
      status: z.string().optional().describe('Filter by build status'),
      workflowId: z.string().optional().describe('Filter by workflow ID'),
      branch: z.string().optional().describe('Filter by branch'),
      tag: z.string().optional().describe('Filter by tag'),
      label: z.string().optional().describe('Filter by label'),
    },
    ({ teamId, appId, status, workflowId, branch, tag, label }) =>
      handleToolCall(() =>
        v3.get<V3BuildsResponse>(
          `/teams/${encodeURIComponent(teamId)}/builds`,
          { appId, status, workflowId, branch, tag, label },
        ),
      ),
  );
}
