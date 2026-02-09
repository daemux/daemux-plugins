/**
 * Telegram Bot API HTTP Transport
 * Core HTTP client with JSON and FormData methods.
 * Send methods are in api-send.ts.
 */

import type {
  TelegramApiResponse,
  TelegramBotInfo,
  TelegramFileInfo,
  TelegramUpdate,
} from './types';

const BASE_URL = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 30_000;
const FILE_DOWNLOAD_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class TelegramApiError extends Error {
  readonly errorCode: number;
  readonly retryAfter?: number;

  constructor(method: string, code: number, description: string, retryAfter?: number) {
    super(`Telegram API error [${method}]: ${code} - ${description}`);
    this.name = 'TelegramApiError';
    this.errorCode = code;
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// API Client - Core Transport
// ---------------------------------------------------------------------------

export class TelegramApi {
  private token: string;
  private timeoutMs: number;

  constructor(token: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  /** Build the API endpoint URL for a method. */
  methodUrl(method: string): string {
    return `${BASE_URL}/bot${this.token}/${method}`;
  }

  /** Build the file download URL. */
  fileDownloadUrl(filePath: string): string {
    if (filePath.includes('..')) {
      throw new Error('Invalid file path');
    }
    return `${BASE_URL}/file/bot${this.token}/${filePath}`;
  }

  /** Get the configured request timeout. */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /** Call a Telegram Bot API method with JSON body. */
  async callMethod<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T> {
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
    const signal = options?.signal
      ? AbortSignal.any([timeoutSignal, options.signal])
      : timeoutSignal;

    const response = await fetch(this.methodUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
      signal,
    });

    return this.parseResponse<T>(response, method);
  }

  /** Call a Telegram Bot API method with FormData body (for file uploads). */
  async sendFormData<T>(method: string, formData: FormData): Promise<T> {
    const response = await fetch(this.methodUrl(method), {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    return this.parseResponse<T>(response, method);
  }

  /** Verify the bot token and get bot info. */
  async getMe(): Promise<TelegramBotInfo> {
    return this.callMethod<TelegramBotInfo>('getMe');
  }

  /** Fetch new updates via long polling. */
  async getUpdates(offset?: number, timeout = 30, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    // HTTP timeout must exceed Telegram's long-polling timeout to avoid
    // aborting the request before Telegram responds with "no updates".
    // Buffer of 10s accounts for network latency and server processing.
    const httpTimeoutMs = (timeout + 10) * 1000;

    return this.callMethod<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'edited_message'],
    }, { signal, timeoutMs: httpTimeoutMs });
  }

  /** Get file info (needed before downloading). */
  async getFile(fileId: string): Promise<TelegramFileInfo> {
    return this.callMethod<TelegramFileInfo>('getFile', { file_id: fileId });
  }

  /** Download a file by its file_path. */
  async downloadFile(filePath: string, maxBytes?: number): Promise<Buffer> {
    const response = await fetch(this.fileDownloadUrl(filePath), {
      signal: AbortSignal.timeout(FILE_DOWNLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`File download failed: HTTP ${response.status} ${response.statusText}`);
    }

    // Fast pre-check using Content-Length header before reading body.
    if (maxBytes) {
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        throw new Error(`File exceeds size limit: ${contentLength} > ${maxBytes} bytes`);
      }
    }

    const arrayBuffer = await response.arrayBuffer();

    if (maxBytes && arrayBuffer.byteLength > maxBytes) {
      throw new Error(`File exceeds size limit: ${arrayBuffer.byteLength} > ${maxBytes} bytes`);
    }

    return Buffer.from(arrayBuffer);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async parseResponse<T>(response: Response, method: string): Promise<T> {
    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new TelegramApiError(
        method,
        data.error_code ?? response.status,
        data.description ?? 'Unknown error',
        data.parameters?.retry_after,
      );
    }

    return data.result as T;
  }
}
