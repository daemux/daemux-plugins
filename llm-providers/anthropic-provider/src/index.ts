/**
 * Anthropic Provider Plugin for daemux
 * Entry point with activate/deactivate lifecycle
 */

import { AnthropicProvider } from './provider';
import type { LLMProvider } from './provider';

// Re-export types and utilities
export { AnthropicProvider } from './provider';
export type {
  LLMProvider,
  LLMProviderCapabilities,
  LLMModel,
  LLMCredentials,
  LLMChatOptions,
  LLMChatChunk,
  LLMChatResponse,
  ToolDefinition,
} from './provider';

export {
  CLAUDE_MODELS,
  DEFAULT_MODEL,
  COMPACTION_MODEL,
  getModel,
  isValidModel,
} from './models';

export {
  TOKEN_PREFIX,
  API_KEY_PREFIX,
  TOKEN_MIN_LENGTH,
  buildClientOptions,
  buildOAuthSystemPromptAddition,
  detectCredentialType,
  validateCredentialFormat,
} from './auth';

/**
 * Plugin manifest
 */
export const manifest = {
  name: '@daemux/anthropic-provider',
  version: '1.0.0',
  description: 'Anthropic Claude provider for daemux',
  author: 'daemux',
};

/**
 * Provider instance (singleton)
 */
let providerInstance: AnthropicProvider | null = null;

/**
 * Plugin API interface (matches daemux PluginAPI)
 */
interface PluginAPI {
  registerProvider(id: string, provider: LLMProvider): void;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}

/**
 * Activate the plugin
 * Called by daemux plugin loader
 */
export async function activate(api: PluginAPI): Promise<void> {
  api.log('info', 'Activating Anthropic provider plugin');

  providerInstance = new AnthropicProvider();
  api.registerProvider('anthropic', providerInstance);

  api.log('info', 'Anthropic provider registered successfully');
}

/**
 * Deactivate the plugin
 * Called when plugin is unloaded
 */
export async function deactivate(): Promise<void> {
  if (providerInstance) {
    await providerInstance.shutdown();
    providerInstance = null;
  }
}

/**
 * Get the provider instance (for direct use)
 */
export function getProvider(): AnthropicProvider | null {
  return providerInstance;
}

/**
 * Create a new provider instance (for standalone use)
 */
export function createProvider(): AnthropicProvider {
  return new AnthropicProvider();
}

/**
 * Default export for plugin loading
 */
export default {
  manifest,
  activate,
  deactivate,
};
