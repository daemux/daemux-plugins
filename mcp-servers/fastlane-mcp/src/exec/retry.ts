/**
 * Exponential backoff retry logic.
 * Retries up to maxAttempts times with doubling delay (1s, 2s, 4s).
 */

import { ProxyError } from './errors.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute fn with exponential backoff retries.
 * If all attempts fail, throws the last error.
 * When proxy is enabled and all retries exhausted, wraps in ProxyError.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
  proxyEnabled = false,
): Promise<T> {
  const { maxAttempts, baseDelayMs } = { ...DEFAULT_RETRY, ...opts };
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delayMs);
      }
    }
  }

  if (proxyEnabled) {
    const msg = lastError instanceof Error
      ? lastError.message
      : String(lastError);
    throw new ProxyError(
      `All ${maxAttempts} retry attempts failed via proxy: ${msg}`,
    );
  }

  throw lastError;
}
