/**
 * Channel Interface Types
 * Local definitions that mirror daemux-cli's channel abstractions.
 * Kept here to avoid a hard dependency on daemux-cli at compile time.
 */

import type { ChannelMessageType } from './types';

// ---------------------------------------------------------------------------
// Rich Channel Message
// ---------------------------------------------------------------------------

export interface RichChannelMessage {
  [key: string]: unknown;
  id: string;
  channelId: string;
  channelType: string;
  messageType: ChannelMessageType;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
  content: string;
  attachments: ChannelAttachment[];
  replyToId?: string;
  threadId?: string;
  timestamp: number;
  isGroup: boolean;
  chatTitle?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export interface ChannelAttachment {
  type: ChannelMessageType;
  /** For Telegram, this holds the file_id for downloading */
  url?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Send Options
// ---------------------------------------------------------------------------

export interface ChannelSendOptions {
  parseMode?: 'text' | 'markdown' | 'html';
  replyToId?: string;
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

export type ChannelEventType = 'connected' | 'disconnected' | 'error' | 'message';

export type EventHandlers = {
  connected: Array<() => void | Promise<void>>;
  disconnected: Array<(reason?: string) => void | Promise<void>>;
  error: Array<(error: Error) => void | Promise<void>>;
  message: Array<(message: RichChannelMessage) => void | Promise<void>>;
};
