/**
 * Anthropic Provider Plugin for daemux
 * Entry point with activate/deactivate lifecycle
 */

import { AnthropicProvider } from './provider.js';
import type { LLMProvider } from '@daemux/plugin-sdk';

// Re-export types from SDK and implementation
export { AnthropicProvider } from './provider.js';
export type {
  LLMProvider,
  LLMProviderCapabilities,
  LLMModel,
  LLMCredentials,
  LLMChatOptions,
  LLMChatChunk,
  LLMChatResponse,
  ToolDefinition,
} from '@daemux/plugin-sdk';

export {
  CLAUDE_MODELS,
  DEFAULT_MODEL,
  COMPACTION_MODEL,
  getModel,
  isValidModel,
} from './models.js';

export {
  TOKEN_PREFIX,
  API_KEY_PREFIX,
  TOKEN_MIN_LENGTH,
  buildClientOptions,
  buildOAuthSystemPromptAddition,
  detectCredentialType,
  validateCredentialFormat,
} from './auth.js';

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
 * Plugin API subset needed by this plugin
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
