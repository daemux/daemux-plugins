import { BaseClient } from './base-client.js';

const BASE_URL = 'https://codemagic.io/api/v3';
const DEFAULT_TIMEOUT_MS = 30_000;

export class V3Client extends BaseClient {
  constructor(token: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
    super(BASE_URL, token, timeoutMs);
  }

  async get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const queryStr = this.buildQuery(query);
    return this.request<T>('GET', `${path}${queryStr}`);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private buildQuery(params?: Record<string, string | undefined>): string {
    if (!params) return '';
    const entries = Object.entries(params).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );
    if (entries.length === 0) return '';
    return '?' + new URLSearchParams(entries).toString();
  }
}
