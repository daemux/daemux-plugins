/**
 * Telegram Adapter Plugin Entry Point
 * Registers the TelegramChannel with the daemux plugin system.
 */

import { TelegramChannel } from './channel.js';

// Re-export public API
export { TelegramChannel } from './channel.js';
export { TelegramApi, TelegramApiError } from './api.js';
export {
  sendMessage, sendPhoto, sendDocument, sendAudio, sendVideo,
  sendVoice, sendVideoNote, sendSticker, sendAnimation,
} from './api-send.js';
export type { MediaSendOptions } from './api-send.js';
export { TelegramPoller } from './poller.js';
export { telegramHtmlFormatter, markdownToTelegramHtml, chunkText, escapeHtml } from './format.js';
export { resolveMessageType, resolveFileId, resolveAttachment } from './message-resolver.js';
export type { ResolvedAttachment } from './message-resolver.js';
export type { ChannelFormatter, RichChannelMessage, ChannelAttachment, ChannelSendOptions } from '@daemux/plugin-sdk';
export type {
  TelegramUser,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
  TelegramChannelConfig,
  TelegramFileInfo,
  TelegramBotInfo,
  ChannelMessageType,
} from './types.js';

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

export const manifest = {
  name: '@daemux/telegram-adapter',
  version: '1.0.0',
  description: 'Telegram Bot API channel adapter for daemux',
  author: 'daemux',
};

// ---------------------------------------------------------------------------
// Plugin API subset needed by this plugin
// ---------------------------------------------------------------------------

interface PluginAPI {
  registerChannel(channel: {
    id: string;
    type: string;
    connect(config: Record<string, unknown>): Promise<void>;
    disconnect(): Promise<void>;
    send(
      target: { channelId: string; userId?: string; threadId?: string },
      message: string,
      options?: { attachments?: Array<{ type: string; data: Buffer; filename: string }>; replyToId?: string },
    ): Promise<string>;
    onMessage(handler: (message: {
      id: string;
      channelId: string;
      senderId: string;
      content: string;
      timestamp: number;
      [key: string]: unknown;
    }) => Promise<void>): void;
  }): void;
  log(level: string, message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Plugin Lifecycle
// ---------------------------------------------------------------------------

let channelInstance: TelegramChannel | null = null;

/** Activate the plugin. Called by the daemux plugin loader. */
export async function activate(api: PluginAPI): Promise<void> {
  api.log('info', 'Activating Telegram adapter plugin');

  channelInstance = new TelegramChannel();
  api.registerChannel(channelInstance);

  api.log('info', 'Telegram channel registered successfully');
}

/** Deactivate the plugin. Called when the plugin is unloaded. */
export async function deactivate(): Promise<void> {
  if (channelInstance) {
    if (channelInstance.connected) {
      await channelInstance.disconnect();
    }
    channelInstance = null;
  }
}

/** Get the current channel instance (for programmatic access). */
export function getChannel(): TelegramChannel | null {
  return channelInstance;
}

/** Default export for plugin loading (matches anthropic-provider pattern). */
export default { manifest, activate, deactivate };
