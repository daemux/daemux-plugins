/**
 * Error types and MCP error formatting for Codemagic API.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class CodemagicApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly method: string,
    public readonly responseBody: unknown,
  ) {
    super(`Codemagic API ${statusCode} ${method} ${endpoint}`);
    this.name = 'CodemagicApiError';
  }
}

export function formatErrorForMcp(error: unknown): CallToolResult {
  if (error instanceof CodemagicApiError) {
    const bodyStr = typeof error.responseBody === 'string'
      ? error.responseBody
      : JSON.stringify(error.responseBody, null, 2);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}\nResponse: ${bodyStr}`,
      }],
      isError: true,
    };
  }

  if (error instanceof Error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: `Error: ${String(error)}` }],
    isError: true,
  };
}

export function resolveAppId(appId: string | undefined, defaultAppId: string | undefined): string {
  const resolved = appId ?? defaultAppId;
  if (!resolved) throw new Error('appId is required (no default configured)');
  return resolved;
}

export async function handleToolCall(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return formatErrorForMcp(error);
  }
}
