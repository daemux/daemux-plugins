/**
 * App Store Connect REST API client.
 * Uses JWT Bearer auth and optional proxy via undici ProxyAgent.
 */

import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { generateJwt } from '../auth/api-key.js';
import type { ProxyConfig } from './proxy.js';
import { withRetry } from './retry.js';
import { AscApiError } from './errors.js';

const BASE_URL = 'https://api.appstoreconnect.apple.com';
const TIMEOUT_MS = 30_000;

export interface AscClientConfig {
  proxy: ProxyConfig | null;
}

/** Build fetch options with JWT auth and optional proxy dispatcher. */
async function buildFetchOptions(
  config: AscClientConfig,
  method: string,
  body?: unknown,
): Promise<UndiciRequestInit> {
  const jwt = await generateJwt();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };

  const opts: UndiciRequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  if (config.proxy) {
    opts.dispatcher = config.proxy.agent;
  }

  return opts;
}

/** Parse JSON response or throw AscApiError on failure. */
async function handleResponse<T>(
  response: { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> },
  method: string,
  path: string,
): Promise<T> {
  if (!response.ok) {
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text().catch(
        () => 'Unable to read response',
      );
    }
    throw new AscApiError(
      response.status,
      path,
      method,
      responseBody,
    );
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Execute a fetch request with retry and proxy support. */
async function doRequest<T>(
  config: AscClientConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return withRetry(
    async () => {
      const opts = await buildFetchOptions(config, method, body);
      const url = `${BASE_URL}${path}`;
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS,
      );
      try {
        const response = await undiciFetch(url, {
          ...opts,
          signal: controller.signal,
        });
        return await handleResponse<T>(response, method, path);
      } finally {
        clearTimeout(timer);
      }
    },
    { maxAttempts: 3 },
    config.proxy !== null,
  );
}

export function ascGet<T>(
  config: AscClientConfig,
  path: string,
): Promise<T> {
  return doRequest<T>(config, 'GET', path);
}

export function ascPost<T>(
  config: AscClientConfig,
  path: string,
  body: unknown,
): Promise<T> {
  return doRequest<T>(config, 'POST', path, body);
}

export function ascPatch<T>(
  config: AscClientConfig,
  path: string,
  body: unknown,
): Promise<T> {
  return doRequest<T>(config, 'PATCH', path, body);
}

export function ascDelete<T>(
  config: AscClientConfig,
  path: string,
): Promise<T> {
  return doRequest<T>(config, 'DELETE', path);
}
