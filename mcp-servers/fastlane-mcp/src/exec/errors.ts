/**
 * Error classes and MCP error formatting for Fastlane MCP server.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class FastlaneCliError extends Error {
  constructor(
    public readonly action: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(`Fastlane action '${action}' failed (exit ${exitCode})`);
    this.name = 'FastlaneCliError';
  }
}

export class AscApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly method: string,
    public readonly responseBody: unknown,
  ) {
    super(`ASC API ${statusCode} ${method} ${endpoint}`);
    this.name = 'AscApiError';
  }
}

export class ProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function formatErrorBody(error: unknown): string {
  if (error instanceof FastlaneCliError) {
    return `Error: ${error.message}\nStderr: ${error.stderr}`;
  }
  if (error instanceof AscApiError) {
    const bodyStr = typeof error.responseBody === 'string'
      ? error.responseBody
      : JSON.stringify(error.responseBody, null, 2);
    return `Error: ${error.message}\nResponse: ${bodyStr}`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}

export function formatErrorForMcp(error: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: formatErrorBody(error) }],
    isError: true,
  };
}

export async function handleToolCall(
  fn: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    const result = await fn();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    return formatErrorForMcp(error);
  }
}
