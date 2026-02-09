import { CodemagicApiError } from './errors.js';

export abstract class BaseClient {
  constructor(
    protected readonly baseUrl: string,
    protected readonly token: string,
    protected readonly timeoutMs: number,
  ) {}

  protected async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'x-auth-token': this.token,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text().catch(() => 'Unable to read response');
      }
      throw new CodemagicApiError(response.status, path, method, responseBody);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }
}
