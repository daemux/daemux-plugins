import { BaseClient } from './base-client.js';

const BASE_URL = 'https://api.codemagic.io';
const DEFAULT_TIMEOUT_MS = 30_000;

export class LegacyClient extends BaseClient {
  constructor(token: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
    super(BASE_URL, token, timeoutMs);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
