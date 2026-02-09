/**
 * Fastlane CLI subprocess execution.
 * Uses execFile (not exec) to avoid shell injection.
 * Injects proxy env vars and Fastlane settings.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAuthState } from '../auth/api-key.js';
import type { ProxyConfig } from './proxy.js';
import { withRetry } from './retry.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const SCREENSHOT_TIMEOUT_MS = 1_800_000;

const FASTLANE_ENV: Record<string, string> = {
  FASTLANE_DISABLE_COLORS: '1',
  FASTLANE_SKIP_UPDATE_CHECK: '1',
};

export type CliParams = Record<string, string | boolean | number>;

/** Common deliver flags to skip binary, screenshots, metadata and force. */
export const DELIVER_SKIP_DEFAULTS: CliParams = {
  skip_binary_upload: true,
  skip_screenshots: true,
  skip_metadata: true,
  force: true,
};

/**
 * Strip undefined/null values from a params object.
 * Avoids repetitive `if (x !== undefined) params.x = x` blocks.
 */
export function compactParams(
  input: Record<string, string | boolean | number | undefined | null>,
): CliParams {
  const result: CliParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

export interface FastlaneRunnerConfig {
  proxy: ProxyConfig | null;
}

export interface RunActionOptions {
  action: string;
  params: CliParams;
  timeoutMs?: number;
}

/**
 * Build Fastlane CLI arguments from an action and key-value params.
 * Format: run <action> key1:val1 key2:val2
 */
function buildArgs(
  action: string,
  params: CliParams,
): string[] {
  const args = ['run', action];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    args.push(`${key}:${String(value)}`);
  }
  return args;
}

/** Build the environment variables for fastlane subprocess. */
function buildEnv(
  proxy: ProxyConfig | null,
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...FASTLANE_ENV,
    ...(proxy?.envVars),
  };
}

/**
 * Run a Fastlane CLI action with retries and proxy support.
 * Returns the stdout output on success.
 */
export async function runFastlaneAction(
  config: FastlaneRunnerConfig,
  opts: RunActionOptions,
): Promise<string> {
  const auth = getAuthState();
  const params = { ...opts.params };

  if (auth.apiKeyJsonPath) {
    params.api_key_path = auth.apiKeyJsonPath;
  }

  const args = buildArgs(opts.action, params);
  const env = buildEnv(config.proxy);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return withRetry(
    async () => {
      const { stdout } = await execFileAsync('fastlane', args, {
        env,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    },
    { maxAttempts: 3 },
    config.proxy !== null,
  );
}

/** Convenience: run fastlane with screenshot-specific timeout. */
export async function runScreenshotAction(
  config: FastlaneRunnerConfig,
  opts: Omit<RunActionOptions, 'timeoutMs'>,
): Promise<string> {
  return runFastlaneAction(config, {
    ...opts,
    timeoutMs: SCREENSHOT_TIMEOUT_MS,
  });
}
