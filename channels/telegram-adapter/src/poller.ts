/**
 * Telegram Long-Polling Manager
 * Handles update fetching with exponential backoff and graceful shutdown.
 */

import type { TelegramUpdate } from './types.js';
import type { TelegramApi } from './api.js';
import { TelegramApiError } from './api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpdateHandler = (update: TelegramUpdate) => Promise<void>;

export type PollerLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
};

const defaultLogger: PollerLogger = {
  info: (msg) => console.log(`[telegram-poller] ${msg}`),
  warn: (msg) => console.warn(`[telegram-poller] ${msg}`),
  error: (msg, err) => console.error(`[telegram-poller] ${msg}`, err ?? ''),
};

// ---------------------------------------------------------------------------
// Poller
// ---------------------------------------------------------------------------

export class TelegramPoller {
  private api: TelegramApi;
  private handler: UpdateHandler;
  private running = false;
  private offset: number | undefined;
  private pollTimeoutSec: number;
  private abortController: AbortController | null = null;
  private consecutiveErrors = 0;
  private maxBackoffMs: number;
  private logger: PollerLogger;

  constructor(options: {
    api: TelegramApi;
    handler: UpdateHandler;
    pollTimeoutSec?: number;
    maxBackoffMs?: number;
    logger?: PollerLogger;
  }) {
    this.api = options.api;
    this.handler = options.handler;
    this.pollTimeoutSec = options.pollTimeoutSec ?? 30;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.logger = options.logger ?? defaultLogger;
  }

  /** Start the polling loop. This method runs until stop() is called. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.logger.info('Polling started');

    while (this.running) {
      try {
        const updates = await this.api.getUpdates(
          this.offset, this.pollTimeoutSec, this.abortController?.signal,
        );
        this.consecutiveErrors = 0;

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.processUpdate(update);
        }
      } catch (err) {
        if (!this.running) break;
        await this.handlePollingError(err);
      }
    }

    this.logger.info('Polling stopped');
  }

  /** Signal the polling loop to stop. */
  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Whether the poller is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      await this.handler(update);
    } catch (err) {
      this.logger.error(
        `Update handler error for update_id=${update.update_id}`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async handlePollingError(err: unknown): Promise<void> {
    this.consecutiveErrors++;

    // Telegram rate limit: respect the retry_after value.
    if (err instanceof TelegramApiError && err.retryAfter) {
      const waitMs = err.retryAfter * 1000;
      this.logger.warn(`Rate limited, waiting ${err.retryAfter}s`);
      await this.sleep(waitMs);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... up to maxBackoffMs.
    const backoffMs = Math.min(
      1000 * Math.pow(2, this.consecutiveErrors - 1),
      this.maxBackoffMs,
    );

    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(`Polling error (retry in ${backoffMs}ms): ${errorMessage}`);

    await this.sleep(backoffMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
