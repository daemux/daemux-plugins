/**
 * Message Conversion Utilities
 * Converts Telegram messages to RichChannelMessage format.
 */

import type { TelegramMessage, TelegramChannelConfig } from './types.js';
import type { RichChannelMessage, ChannelAttachment } from '@daemux/plugin-sdk';
import { resolveMessageType, resolveAttachment, type ResolvedAttachment } from './message-resolver.js';

// ---------------------------------------------------------------------------
// User Allowlist Check
// ---------------------------------------------------------------------------

export function isUserAllowed(msg: TelegramMessage, config: TelegramChannelConfig | null): boolean {
  const allowedIds = config?.allowedUserIds;
  if (!allowedIds || allowedIds.length === 0) return true;

  const senderId = msg.from?.id;
  if (!senderId) return false;

  return allowedIds.includes(senderId);
}

// ---------------------------------------------------------------------------
// Telegram Message -> RichChannelMessage
// ---------------------------------------------------------------------------

export function convertTelegramMessage(msg: TelegramMessage): RichChannelMessage {
  const messageType = resolveMessageType(msg);
  const attachment = resolveAttachment(msg);

  return {
    id: String(msg.message_id),
    channelId: String(msg.chat.id),
    channelType: 'telegram',
    messageType,
    senderId: String(msg.from?.id ?? 0),
    senderName: buildSenderName(msg),
    senderUsername: msg.from?.username,
    content: msg.text ?? msg.caption ?? '',
    attachments: attachment ? [buildChannelAttachment(attachment)] : [],
    replyToId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
    threadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined,
    timestamp: msg.date * 1000,
    isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
    chatTitle: msg.chat.title,
    metadata: {
      chatType: msg.chat.type,
      telegramMessageId: msg.message_id,
      telegramChatId: msg.chat.id,
      isForwarded: msg.forward_date !== undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function buildSenderName(msg: TelegramMessage): string | undefined {
  if (!msg.from) return undefined;
  return [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
}

function buildChannelAttachment(resolved: ResolvedAttachment): ChannelAttachment {
  return {
    type: resolved.type,
    url: resolved.fileId,
    mimeType: resolved.mimeType,
    fileName: resolved.fileName,
    fileSize: resolved.fileSize,
    duration: resolved.duration,
    width: resolved.width,
    height: resolved.height,
  };
}
