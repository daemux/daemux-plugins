/**
 * Anthropic LLM Provider
 * Full implementation of the LLMProvider interface for Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock,
  ContentBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  TextBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

import {
  buildClientOptions,
  buildOAuthSystemPromptAddition,
  validateCredentialFormat,
  type AuthCredentials,
} from './auth';
import {
  CLAUDE_MODELS,
  DEFAULT_MODEL,
  COMPACTION_MODEL,
  type ClaudeModel,
} from './models';

/**
 * LLM Provider interface types (from daemux core)
 * These match the plugin-api-types.ts definitions
 */
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

export interface LLMCredentials {
  type: 'token' | 'api_key';
  value: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

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

export interface LLMProvider {
  id: string;
  name: string;
  capabilities: LLMProviderCapabilities;
  initialize(credentials: LLMCredentials): Promise<void>;
  isReady(): boolean;
  verifyCredentials(credentials: LLMCredentials): Promise<{ valid: boolean; error?: string }>;
  listModels(): LLMModel[];
  getDefaultModel(): string;
  chat(options: LLMChatOptions): AsyncGenerator<LLMChatChunk>;
  compactionChat(options: LLMChatOptions): Promise<LLMChatResponse>;
  shutdown(): Promise<void>;
}

/**
 * Anthropic Provider Implementation
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly capabilities: LLMProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextWindow: 200000,
  };

  private client: Anthropic | null = null;
  private credentials: AuthCredentials | null = null;
  private ready = false;

  /**
   * Initialize the provider with credentials
   */
  async initialize(credentials: LLMCredentials): Promise<void> {
    const authCreds: AuthCredentials = {
      type: credentials.type,
      value: credentials.value,
    };

    const formatResult = validateCredentialFormat(authCreds);
    if (!formatResult.valid) {
      throw new Error(`Invalid credentials: ${formatResult.error}`);
    }

    const clientOptions = buildClientOptions(authCreds);
    this.client = new Anthropic(clientOptions);
    this.credentials = authCreds;
    this.ready = true;
  }

  /**
   * Check if provider is ready for use
   */
  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  /**
   * Verify credentials are valid by making a test API call
   */
  async verifyCredentials(credentials: LLMCredentials): Promise<{ valid: boolean; error?: string }> {
    const authCreds: AuthCredentials = {
      type: credentials.type,
      value: credentials.value,
    };

    const formatResult = validateCredentialFormat(authCreds);
    if (!formatResult.valid) {
      return formatResult;
    }

    try {
      const clientOptions = buildClientOptions(authCreds);
      const testClient = new Anthropic(clientOptions);

      await testClient.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });

      return { valid: true };
    } catch (err) {
      const lowerMessage = (err instanceof Error ? err.message : String(err)).toLowerCase();

      const authErrors = ['authentication_error', 'invalid x-api-key', 'invalid api key', 'invalid_api_key', 'api key not valid'];
      const has401 = lowerMessage.includes('401') && lowerMessage.includes('unauthorized');

      if (authErrors.some(e => lowerMessage.includes(e)) || has401) {
        return { valid: false, error: 'Invalid credentials. Please check your token or API key.' };
      }

      if (['permission_error', 'permission denied', '403'].some(e => lowerMessage.includes(e))) {
        return { valid: false, error: 'Credentials valid but access denied. Check your account permissions.' };
      }

      // Non-authentication errors indicate valid credentials
      return { valid: true };
    }
  }

  /**
   * List available models
   */
  listModels(): LLMModel[] {
    return CLAUDE_MODELS.map(m => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
    }));
  }

  /**
   * Get default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  /**
   * Streaming chat completion
   */
  async *chat(options: LLMChatOptions): AsyncGenerator<LLMChatChunk> {
    if (!this.client || !this.credentials) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    const systemPrompt = this.buildSystemPrompt(options.systemPrompt);
    const messages = this.convertMessages(options.messages);
    const tools = options.tools ? this.convertTools(options.tools) : undefined;

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 8192,
      system: systemPrompt,
      messages,
      tools,
    });

    let currentToolUse: {
      id: string;
      name: string;
      inputJson: string;
    } | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          currentToolUse = {
            id: block.id,
            name: block.name,
            inputJson: '',
          };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield {
            type: 'text',
            content: delta.text,
          };
        } else if (delta.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.inputJson += delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          let toolInput: Record<string, unknown> = {};
          try {
            toolInput = JSON.parse(currentToolUse.inputJson || '{}');
          } catch {
            toolInput = {};
          }
          yield {
            type: 'tool_use',
            toolUseId: currentToolUse.id,
            toolName: currentToolUse.name,
            toolInput,
          };
          currentToolUse = null;
        }
      } else if (event.type === 'message_stop') {
        // Final message with usage
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'done',
      stopReason: this.mapStopReason(finalMessage.stop_reason) ?? undefined,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    };
  }

  /**
   * Non-streaming chat for compaction/summarization
   */
  async compactionChat(options: LLMChatOptions): Promise<LLMChatResponse> {
    if (!this.client || !this.credentials) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    const model = options.model || COMPACTION_MODEL;
    const systemPrompt = this.buildSystemPrompt(options.systemPrompt);
    const messages = this.convertMessages(options.messages);

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemPrompt,
      messages,
    });

    return {
      content: response.content.map((block: ContentBlock) => {
        if (block.type === 'text') return { type: 'text' as const, text: block.text };
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        return { type: 'text' as const, text: '' };
      }),
      stopReason: this.mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.client = null;
    this.credentials = null;
    this.ready = false;
  }

  /**
   * Build system prompt with OAuth identity if needed
   */
  private buildSystemPrompt(basePrompt?: string): string {
    const base = basePrompt ?? 'You are a helpful AI assistant.';
    const oauthAddition = buildOAuthSystemPromptAddition(this.credentials?.type === 'token');
    return base + oauthAddition;
  }

  /**
   * Convert messages to Anthropic format
   */
  private convertMessages(
    messages: Array<{ role: string; content: string | unknown[] }>
  ): MessageParam[] {
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: this.convertContent(msg.content),
    }));
  }

  /**
   * Convert content to Anthropic format
   */
  private convertContent(content: string | unknown[]): string | ContentBlockParam[] {
    if (typeof content === 'string') return content;

    return (content as unknown[]).map(block => {
      const b = block as Record<string, unknown>;

      if (b.type === 'text') return { type: 'text', text: b.text } as TextBlockParam;

      if (b.type === 'image') {
        const source = b.source as Record<string, unknown>;
        return {
          type: 'image',
          source: {
            type: source.type as 'base64' | 'url',
            media_type: source.media_type as string,
            data: source.data as string,
          },
        } as ImageBlockParam;
      }

      if (b.type === 'tool_use') {
        return { type: 'tool_use', id: b.id, name: b.name, input: b.input } as ToolUseBlockParam;
      }

      if (b.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: b.tool_use_id,
          content: b.content,
          is_error: b.is_error,
        } as ToolResultBlockParam;
      }

      return { type: 'text', text: JSON.stringify(b) } as TextBlockParam;
    });
  }

  /**
   * Convert tools to Anthropic format
   */
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Map Anthropic stop reason to standard format
   */
  private mapStopReason(reason: string | null): 'end_turn' | 'tool_use' | 'max_tokens' | null {
    if (reason === 'end_turn' || reason === 'tool_use' || reason === 'max_tokens') {
      return reason;
    }
    return null;
  }
}
