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
} from './types/llm';

// Channel types
export type {
  ChannelMessageType,
  ChannelAttachment,
  RichChannelMessage,
  ChannelSendOptions,
  ChannelEventHandler,
  ChannelEventType,
  EnhancedChannel,
  ChannelFormatter,
  ChannelMessage,
  ChannelTarget,
  Channel,
} from './types/channel';

// Transcription types
export type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionProvider,
} from './types/transcription';

// Plugin system types
export type {
  LogLevel,
  Logger,
  MemoryEntry,
  MemoryProvider,
  HookEvent,
  HookContext,
  HookResult,
  HookHandler,
  AgentDefinition,
  AgentResult,
  TaskStatus,
  Task,
  PluginManifest,
  PluginAPI,
  Plugin,
} from './types/plugin';
