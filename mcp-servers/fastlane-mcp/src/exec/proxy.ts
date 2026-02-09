/**
 * Proxy configuration for Fastlane CLI and ASC API fetch calls.
 * Reads from FASTLANE_MCP_PROXY, then HTTP_PROXY / HTTPS_PROXY.
 */

import { ProxyAgent } from 'undici';

export interface ProxyConfig {
  /** Proxy URL (e.g. http://user:pass@host:port) */
  url: string;
  /** undici ProxyAgent for fetch() dispatcher */
  agent: ProxyAgent;
  /** Env vars to inject into child_process for Fastlane CLI */
  envVars: Record<string, string>;
}

/**
 * Resolve proxy configuration from environment variables.
 * Priority: FASTLANE_MCP_PROXY > HTTPS_PROXY > HTTP_PROXY
 * Returns null if no proxy is configured.
 */
export function resolveProxyConfig(): ProxyConfig | null {
  const proxyUrl =
    process.env.FASTLANE_MCP_PROXY
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY;

  if (!proxyUrl) {
    return null;
  }

  const agent = new ProxyAgent(proxyUrl);

  const envVars: Record<string, string> = {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
  };

  return { url: proxyUrl, agent, envVars };
}
