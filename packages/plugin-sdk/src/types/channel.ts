/**
 * Channel Type Definitions
 * Rich message types, attachments, send options, and the EnhancedChannel interface.
 */

// ---------------------------------------------------------------------------
// Message Content Types
// ---------------------------------------------------------------------------

export type ChannelMessageType =
  | 'text'
  | 'photo'
  | 'audio'
  | 'video'
  | 'voice'
  | 'video_note'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'animation';

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export interface ChannelAttachment {
  type: ChannelMessageType;
  /** Remote URL or file ID if available */
  url?: string;
  /** Local file path if downloaded */
  filePath?: string;
  /** Raw buffer data */
  data?: Buffer;
  /** MIME type */
  mimeType?: string;
  /** Original filename */
  fileName?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Duration in seconds (audio/video/voice/video_note) */
  duration?: number;
  /** Width in pixels (photo/video/video_note/sticker) */
  width?: number;
  /** Height in pixels (photo/video/video_note/sticker) */
  height?: number;
}

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
  /** Text content or caption */
  content: string;
  /** Attached media */
  attachments: ChannelAttachment[];
  /** ID of the message being replied to */
  replyToId?: string;
  /** Thread/topic ID */
  threadId?: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Is this from a group chat? */
  isGroup: boolean;
  /** Group/chat title */
  chatTitle?: string;
  /** Raw provider-specific metadata */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Send Options
// ---------------------------------------------------------------------------

export interface ChannelSendOptions {
  /** Attachments to send */
  attachments?: Array<{
    type: ChannelMessageType;
    data: Buffer;
    fileName: string;
    mimeType?: string;
  }>;
  /** Message ID to reply to */
  replyToId?: string;
  /** Thread/topic ID */
  threadId?: string;
  /** Text formatting mode */
  parseMode?: 'text' | 'markdown' | 'html';
}

// ---------------------------------------------------------------------------
// Channel Events
// ---------------------------------------------------------------------------

export type ChannelEventHandler = {
  connected: () => void | Promise<void>;
  disconnected: (reason?: string) => void | Promise<void>;
  error: (error: Error) => void | Promise<void>;
  message: (message: RichChannelMessage) => void | Promise<void>;
};

export type ChannelEventType = keyof ChannelEventHandler;

// ---------------------------------------------------------------------------
// Enhanced Channel Interface
// ---------------------------------------------------------------------------

export interface EnhancedChannel {
  /** Unique channel instance ID */
  readonly id: string;
  /** Channel type identifier (e.g., 'telegram', 'discord') */
  readonly type: string;
  /** Whether the channel is currently connected */
  readonly connected: boolean;

  /** Connect to the channel service */
  connect(config: Record<string, unknown>): Promise<void>;
  /** Disconnect from the channel service */
  disconnect(): Promise<void>;

  /** Send a text message */
  sendText(
    chatId: string,
    text: string,
    options?: ChannelSendOptions,
  ): Promise<string>;

  /** Send a media attachment */
  sendMedia(
    chatId: string,
    attachment: {
      type: ChannelMessageType;
      data: Buffer;
      fileName: string;
      mimeType?: string;
      caption?: string;
    },
    options?: ChannelSendOptions,
  ): Promise<string>;

  /** Download a file attachment by its remote ID/URL */
  downloadAttachment(
    fileId: string,
  ): Promise<{ data: Buffer; mimeType?: string; fileName?: string }>;

  /** Register an event handler */
  on<E extends ChannelEventType>(
    event: E,
    handler: ChannelEventHandler[E],
  ): () => void;
}

// ---------------------------------------------------------------------------
// Channel Formatter Interface
// ---------------------------------------------------------------------------

export interface ChannelFormatter {
  /** Format bold text */
  bold(text: string): string;
  /** Format italic text */
  italic(text: string): string;
  /** Format strikethrough text */
  strikethrough(text: string): string;
  /** Format inline code */
  code(text: string): string;
  /** Format code block with optional language */
  codeBlock(text: string, language?: string): string;
  /** Format a hyperlink */
  link(text: string, url: string): string;
  /** Escape special characters for this format */
  escape(text: string): string;
  /** Convert markdown to this channel's native format */
  fromMarkdown(markdown: string): string;
  /** Split text into chunks respecting format boundaries */
  chunk(text: string, maxLength: number): string[];
}

// ---------------------------------------------------------------------------
// Basic Channel Interface (from plugin-api-types)
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName?: string;
  content: string;
  attachments?: Array<{
    type: string;
    url?: string;
    data?: Buffer;
  }>;
  replyToId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelTarget {
  channelId: string;
  userId?: string;
  threadId?: string;
}

export interface Channel {
  id: string;
  type: string;
  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  send(
    target: ChannelTarget,
    message: string,
    options?: {
      attachments?: Array<{ type: string; data: Buffer; filename: string }>;
      replyToId?: string;
    },
  ): Promise<string>;
  onMessage(handler: (message: ChannelMessage) => Promise<void>): void;
}
