/**
 * Plugin System Type Definitions
 * PluginAPI, Plugin manifest, Logger, MemoryProvider, HookEvents.
 */

import type { Channel, ChannelTarget } from './channel';
import type { LLMProvider } from './llm';
import type { TranscriptionProvider } from './transcription';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Memory Provider
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
  similarity?: number;
}

export interface MemoryProvider {
  id: string;
  store(content: string, metadata?: Record<string, unknown>): Promise<string>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  get(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook Events
// ---------------------------------------------------------------------------

export type HookEvent =
  | 'message'
  | 'agent:start'
  | 'agent:end'
  | 'subagent:spawn'
  | 'startup'
  | 'shutdown'
  | 'preCompact';

export interface HookContext {
  event: HookEvent;
  sessionId: string;
  agentId?: string;
  message?: unknown;
  taskId?: string;
  data?: Record<string, unknown>;
}

export interface HookResult {
  allow: boolean;
  additionalContext?: string;
  error?: string;
}

export type HookHandler = (context: HookContext) => Promise<HookResult>;

// ---------------------------------------------------------------------------
// Agent & Task Types
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt?: string;
  tools?: string[];
  model?: string;
  maxTokens?: number;
}

export interface AgentResult {
  output: string;
  toolResults?: Array<{ toolName: string; result: string }>;
  error?: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  activeForm?: string;
  owner?: string;
  blocks?: string[];
  blockedBy?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  main?: string;
  agents?: string | string[];
  commands?: string;
  hooks?: string;
  mcp?: string;
}

// ---------------------------------------------------------------------------
// Plugin API Interface (18 Methods)
// ---------------------------------------------------------------------------

export interface PluginAPI {
  // Registration (6 methods)
  registerChannel(channel: Channel): void;
  registerMCP(id: string, config: Record<string, unknown>): void;
  registerAgent(agent: AgentDefinition): void;
  registerMemory(provider: MemoryProvider): void;
  registerProvider(id: string, provider: LLMProvider): void;
  registerTranscription(provider: TranscriptionProvider): void;

  // Agent Operations (3 methods)
  spawnSubagent(
    agentName: string,
    task: string,
    options?: { timeout?: number; tools?: string[] },
  ): Promise<AgentResult>;
  listAgents(): AgentDefinition[];
  getAgent(name: string): AgentDefinition | undefined;

  // Task Operations (4 methods)
  createTask(task: {
    subject: string;
    description: string;
    activeForm?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Task>;
  updateTask(
    taskId: string,
    updates: {
      status?: TaskStatus;
      subject?: string;
      description?: string;
      activeForm?: string;
      owner?: string;
      addBlocks?: string[];
      addBlockedBy?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<Task>;
  listTasks(filter?: { status?: TaskStatus; owner?: string }): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;

  // Event Hooks (1 method for 7 events)
  on(event: HookEvent, handler: HookHandler): void;

  // Utilities (5 methods)
  sendMessage(channelId: string, target: ChannelTarget, message: string): Promise<string>;
  searchMemory(query: string, options?: { provider?: string; limit?: number }): Promise<MemoryEntry[]>;
  getState<T>(key: string): Promise<T | undefined>;
  setState<T>(key: string, value: T): Promise<void>;
  log(level: LogLevel, message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

export interface Plugin {
  manifest: PluginManifest;
  activate?(api: PluginAPI): Promise<void>;
  deactivate?(): Promise<void>;
}
