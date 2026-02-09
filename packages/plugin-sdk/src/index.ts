/**
 * @daemux/plugin-sdk
 * Shared type definitions for all daemux plugins.
 * This package is dependency-free (pure TypeScript interfaces).
 */

// LLM Provider types
export type {
  ToolInputSchema,
  ToolDefinition,
  LLMProviderCapabilities,
  LLMModel,
  LLMCredentials,
  LLMChatOptions,
  LLMChatChunk,
  LLMChatResponse,
  LLMProvider,
} from './types/llm.js';

// Channel types
export type {
  ChannelMessageType,
  ChannelAttachment,
  RichChannelMessage,
  ChannelSendOptions,
  ChannelEventHandler,
  ChannelEventType,
  ChannelFormatter,
} from './types/channel.js';

// Transcription types
export type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionProvider,
} from './types/transcription.js';

// Plugin system types
/** Log severity levels used by plugin loggers. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
