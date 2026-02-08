/**
 * Anthropic LLM Provider
 * Full implementation of the LLMProvider interface for Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
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
  CLAUDE_CODE_SYSTEM_PREFIX,
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
  /** The Anthropic API expects snake_case, but daemux core uses camelCase */
  input_schema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  inputSchema?: {
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

      if (authCreds.type === 'token') {
        await testClient.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1,
          system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM_PREFIX }],
          messages: [{ role: 'user', content: 'hi' }],
        } as any);
      } else {
        await testClient.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });
      }

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
   * Streaming chat completion.
   * OAuth betas are set via default headers during client construction,
   * so both token and API key paths use `client.messages.stream`.
   */
  async *chat(options: LLMChatOptions): AsyncGenerator<LLMChatChunk> {
    if (!this.client || !this.credentials) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    const systemPrompt = this.buildSystemPrompt(options.systemPrompt);
    const messages = this.convertMessages(options.messages);
    const tools = options.tools ? this.convertTools(options.tools) : undefined;

    const baseParams = {
      model: options.model,
      max_tokens: options.maxTokens ?? 8192,
      system: systemPrompt,
      messages,
      ...(tools ? { tools } : {}),
    };

    const stream = this.client.messages.stream(baseParams as any);

    yield* this.processStream(stream);
  }

  /**
   * Process a streaming response into LLMChatChunk events
   */
  private async *processStream(stream: any): AsyncGenerator<LLMChatChunk> {
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
          yield { type: 'text', content: delta.text };
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
   * Non-streaming chat for compaction/summarization.
   * OAuth betas are set via default headers, so both paths use `client.messages.create`.
   */
  async compactionChat(options: LLMChatOptions): Promise<LLMChatResponse> {
    if (!this.client || !this.credentials) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    const model = options.model || COMPACTION_MODEL;
    const systemPrompt = this.buildSystemPrompt(options.systemPrompt);
    const messages = this.convertMessages(options.messages);

    const baseParams = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemPrompt,
      messages,
    };

    const response = await this.client.messages.create(baseParams as any);

    return {
      content: (response as any).content.map((block: any) => {
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
      stopReason: this.mapStopReason((response as any).stop_reason),
      usage: {
        inputTokens: (response as any).usage.input_tokens,
        outputTokens: (response as any).usage.output_tokens,
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
   * Build system prompt.
   * For OAuth tokens: returns array format with Claude Code identity prefix
   * as the first element (required by the API), followed by the actual prompt.
   * For API keys: returns the prompt as a plain string.
   */
  private buildSystemPrompt(basePrompt?: string): string | Array<{ type: 'text'; text: string }> {
    const base = basePrompt ?? 'You are a helpful AI assistant.';

    if (this.credentials?.type === 'token') {
      const oauthHint = buildOAuthSystemPromptAddition();
      return [
        { type: 'text' as const, text: CLAUDE_CODE_SYSTEM_PREFIX },
        { type: 'text' as const, text: `${oauthHint}\n\n${base}` },
      ];
    }

    return base;
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
   * Convert tools to Anthropic API format.
   * Handles both snake_case (input_schema) and camelCase (inputSchema) from core.
   */
  private convertTools(tools: ToolDefinition[]): any[] {
    return tools.map(tool => {
      const schema = tool.input_schema ?? tool.inputSchema ?? { type: 'object', properties: {} };
      return {
        name: tool.name,
        description: tool.description,
        input_schema: schema,
      };
    });
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
