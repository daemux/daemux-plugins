/**
 * TelegramChannel - Main channel implementation
 * Implements the EnhancedChannel interface for Telegram Bot API.
 * Uses long polling, HTML formatting, and user allowlist enforcement.
 */

import { TelegramApi, TelegramApiError } from './api';
import {
  sendMessage, sendPhoto, sendDocument, sendAudio, sendVideo,
  sendVoice, sendVideoNote, sendAnimation,
} from './api-send';
import { TelegramPoller } from './poller';
import type { PollerLogger } from './poller';
import { markdownToTelegramHtml, chunkText, escapeHtml } from './format';
import { convertTelegramMessage, isUserAllowed } from './channel-convert';
import type { TelegramChannelConfig, TelegramUpdate, ChannelMessageType } from './types';
import type { RichChannelMessage, ChannelSendOptions, ChannelEventType } from '@daemux/plugin-sdk';

/** Internal event handler storage (arrays of handlers per event type) */
type EventHandlers = {
  connected: Array<() => void | Promise<void>>;
  disconnected: Array<(reason?: string) => void | Promise<void>>;
  error: Array<(error: Error) => void | Promise<void>>;
  message: Array<(message: RichChannelMessage) => void | Promise<void>>;
};

const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const HTML_PARSE_ERROR_RE = /can't parse entities|parse entities|find end of the entity/i;

// ---------------------------------------------------------------------------
// TelegramChannel
// ---------------------------------------------------------------------------

export class TelegramChannel {
  readonly id = 'telegram';
  readonly type = 'telegram';
  connected = false;

  private api: TelegramApi | null = null;
  private poller: TelegramPoller | null = null;
  private config: TelegramChannelConfig | null = null;
  private logger: PollerLogger;
  private handlers: EventHandlers = {
    connected: [],
    disconnected: [],
    error: [],
    message: [],
  };

  constructor(logger?: PollerLogger) {
    this.logger = logger ?? {
      info: (msg) => console.log(`[telegram] ${msg}`),
      warn: (msg) => console.warn(`[telegram] ${msg}`),
      error: (msg, err) => console.error(`[telegram] ${msg}`, err ?? ''),
    };
  }

  /** Connect to Telegram by verifying the bot token and starting long polling. */
  async connect(config: Record<string, unknown>): Promise<void> {
    const channelConfig = validateConfig(config);
    this.config = channelConfig;
    this.api = new TelegramApi(channelConfig.botToken);

    const me = await this.api.getMe();
    this.logger.info(`Telegram bot connected: @${me.username} (id: ${me.id})`);

    this.poller = new TelegramPoller({
      api: this.api,
      handler: (update) => this.handleUpdate(update),
      pollTimeoutSec: channelConfig.pollTimeoutSec,
    });

    this.connected = true;
    await this.emit('connected');

    // Start polling in the background (non-blocking).
    this.poller.start().catch((err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Disconnect: stop polling and release resources. */
  async disconnect(): Promise<void> {
    this.poller?.stop();
    this.poller = null;
    this.api = null;
    this.connected = false;
    await this.emit('disconnected', 'manual');
  }

  /** Send a text message, converting markdown to HTML if requested. */
  async sendText(chatId: string, text: string, options?: ChannelSendOptions): Promise<string> {
    this.requireConnected();
    const parseMode = options?.parseMode ?? 'text';
    const formatted = this.formatText(text, parseMode);
    const telegramParseMode = parseMode !== 'text' ? 'HTML' as const : undefined;
    const chunks = chunkText(formatted);
    let lastMessageId = '';

    for (const chunk of chunks) {
      lastMessageId = await this.sendSingleText(chatId, chunk, telegramParseMode, options);
    }

    return lastMessageId;
  }

  /** Send a media attachment (photo, video, audio, document, etc.). */
  async sendMedia(
    chatId: string,
    attachment: {
      type: ChannelMessageType;
      data: Buffer;
      fileName: string;
      mimeType?: string;
      caption?: string;
    },
    options?: { replyToId?: string },
  ): Promise<string> {
    this.requireConnected();
    const replyTo = parseIntOrUndefined(options?.replyToId);
    const msg = await this.routeMediaSend(chatId, attachment, replyTo);
    return String(msg.message_id);
  }

  /** Download a file by its Telegram file_id. */
  async downloadAttachment(
    fileId: string,
  ): Promise<{ data: Buffer; mimeType?: string; fileName?: string }> {
    this.requireConnected();
    const fileInfo = await this.api!.getFile(fileId);
    if (!fileInfo.file_path) {
      throw new Error('File path not available from Telegram');
    }

    const maxSize = this.config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const data = await this.api!.downloadFile(fileInfo.file_path, maxSize);
    const fileName = fileInfo.file_path.split('/').pop();

    return { data, fileName };
  }

  /** Register an event handler. Returns an unsubscribe function. */
  on(
    event: ChannelEventType,
    handler: (...args: never[]) => void | Promise<void>,
  ): () => void {
    const list = this.handlers[event] as Array<(...args: never[]) => void | Promise<void>>;
    list.push(handler);

    return () => {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  /** Register a handler compatible with the basic Channel.onMessage interface. */
  onMessage(handler: (message: RichChannelMessage) => Promise<void>): void {
    this.handlers.message.push(handler);
  }

  /** Send a message via the basic Channel.send interface. */
  async send(
    target: { channelId: string; userId?: string; threadId?: string },
    message: string,
    options?: { replyToId?: string },
  ): Promise<string> {
    return this.sendText(target.channelId, message, {
      parseMode: 'markdown',
      replyToId: options?.replyToId,
      threadId: target.threadId,
    });
  }

  // -----------------------------------------------------------------------
  // Internal: Update Processing
  // -----------------------------------------------------------------------

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message ?? update.edited_message;
    if (!msg) return;

    if (!isUserAllowed(msg, this.config)) return;

    const richMessage = convertTelegramMessage(msg);
    await this.emit('message', richMessage);
  }

  // -----------------------------------------------------------------------
  // Internal: Sending
  // -----------------------------------------------------------------------

  private formatText(text: string, parseMode: string): string {
    if (parseMode === 'markdown') return markdownToTelegramHtml(text);
    return text;
  }

  private async sendSingleText(
    chatId: string,
    text: string,
    parseMode: 'HTML' | undefined,
    options?: ChannelSendOptions,
  ): Promise<string> {
    const replyTo = parseIntOrUndefined(options?.replyToId);
    const threadId = parseIntOrUndefined(options?.threadId);

    try {
      const result = await sendMessage(this.api!, chatId, text, {
        parseMode,
        replyToMessageId: replyTo,
        messageThreadId: threadId,
      });
      return String(result.message_id);
    } catch (err) {
      // If HTML parsing fails, fall back to plain text (matches openclaw pattern).
      if (parseMode === 'HTML' && isHtmlParseError(err)) {
        const result = await sendMessage(this.api!, chatId, escapeHtml(text), {
          replyToMessageId: replyTo,
          messageThreadId: threadId,
        });
        return String(result.message_id);
      }
      throw err;
    }
  }

  private async routeMediaSend(
    chatId: string,
    attachment: { type: ChannelMessageType; data: Buffer; fileName: string; caption?: string },
    replyTo?: number,
  ): Promise<{ message_id: number }> {
    const opts = {
      caption: attachment.caption,
      parseMode: 'HTML' as const,
      fileName: attachment.fileName,
      replyToMessageId: replyTo,
    };

    switch (attachment.type) {
      case 'photo':
        return sendPhoto(this.api!, chatId, attachment.data, opts);
      case 'voice':
        return sendVoice(this.api!, chatId, attachment.data, opts);
      case 'audio':
        return sendAudio(this.api!, chatId, attachment.data, opts);
      case 'video':
        return sendVideo(this.api!, chatId, attachment.data, opts);
      case 'animation':
        return sendAnimation(this.api!, chatId, attachment.data, opts);
      case 'video_note':
        return sendVideoNote(this.api!, chatId, attachment.data, { replyToMessageId: replyTo });
      default:
        return sendDocument(this.api!, chatId, attachment.data, opts);
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Event Emission
  // -----------------------------------------------------------------------

  private requireConnected(): void {
    if (!this.api) throw new Error('Telegram channel is not connected');
  }

  private async emit<E extends ChannelEventType>(
    event: E,
    ...args: Parameters<EventHandlers[E][number]>
  ): Promise<void> {
    for (const handler of this.handlers[event]) {
      try {
        await (handler as (...a: unknown[]) => void | Promise<void>)(...args);
      } catch (err) {
        this.logger.error(`Event handler error [${event}]`, err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHtmlParseError(err: unknown): boolean {
  if (err instanceof TelegramApiError) {
    return HTML_PARSE_ERROR_RE.test(err.message);
  }
  return false;
}

function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function validateConfig(config: Record<string, unknown>): TelegramChannelConfig {
  if (!config.botToken || typeof config.botToken !== 'string') {
    throw new Error('Telegram botToken is required');
  }

  if (config.allowedUserIds !== undefined) {
    if (!Array.isArray(config.allowedUserIds)) {
      throw new Error('allowedUserIds must be an array of numbers');
    }
    for (const id of config.allowedUserIds) {
      if (typeof id !== 'number' || !Number.isFinite(id)) {
        throw new Error('Each element in allowedUserIds must be a finite number');
      }
    }
  }

  return config as unknown as TelegramChannelConfig;
}
