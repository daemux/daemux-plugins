/**
 * LLM Provider Type Definitions
 * Interfaces for LLM providers, models, credentials, and chat operations.
 */

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

/**
 * Tool definition supporting both snake_case (input_schema) for the Anthropic API
 * and camelCase (inputSchema) from daemux core. Providers should accept either.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** Snake_case variant used by the Anthropic API */
  input_schema?: ToolInputSchema;
  /** CamelCase variant used by daemux core */
  inputSchema?: ToolInputSchema;
}

// ---------------------------------------------------------------------------
// Provider Capabilities & Models
// ---------------------------------------------------------------------------

export interface LLMProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  maxContextWindow: number;
}

export interface LLMModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface LLMCredentials {
  type: 'token' | 'api_key';
  value: string;
}

// ---------------------------------------------------------------------------
// Chat Options & Responses
// ---------------------------------------------------------------------------

export interface LLMChatOptions {
  model: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  tools?: ToolDefinition[];
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMChatChunk {
  type: 'text' | 'tool_use' | 'done';
  content?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMChatResponse {
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | null;
  usage: { inputTokens: number; outputTokens: number };
}

// ---------------------------------------------------------------------------
// LLM Provider Interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
  /** Unique identifier for the provider (e.g., 'anthropic', 'openai') */
  id: string;
  /** Human-readable name for the provider */
  name: string;
  /** Provider capabilities */
  capabilities: LLMProviderCapabilities;

  /** Initialize the provider with credentials. Must be called before using other methods. */
  initialize(credentials: LLMCredentials): Promise<void>;
  /** Check if the provider is ready for use */
  isReady(): boolean;
  /** Verify credentials are valid without full initialization */
  verifyCredentials(credentials: LLMCredentials): Promise<{ valid: boolean; error?: string }>;
  /** List available models */
  listModels(): LLMModel[];
  /** Get the default model ID */
  getDefaultModel(): string;
  /** Streaming chat completion */
  chat(options: LLMChatOptions): AsyncGenerator<LLMChatChunk>;
  /** Non-streaming chat completion for compaction/summarization */
  compactionChat(options: LLMChatOptions): Promise<LLMChatResponse>;
  /** Shutdown and cleanup resources */
  shutdown(): Promise<void>;
}
