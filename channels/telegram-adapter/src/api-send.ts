/**
 * Telegram Bot API Send Methods
 * Media send operations that extend the base TelegramApi.
 * Separated from api.ts to keep function count per file within limits.
 */

import type { TelegramApi } from './api';
import type { TelegramMessage } from './types';

// ---------------------------------------------------------------------------
// Common media send options
// ---------------------------------------------------------------------------

export interface MediaSendOptions {
  caption?: string;
  parseMode?: 'HTML';
  fileName?: string;
  replyToMessageId?: number;
}

// ---------------------------------------------------------------------------
// Media file upload helper
// ---------------------------------------------------------------------------

function buildMediaFormData(
  chatId: number | string,
  fieldName: string,
  data: Buffer,
  options?: MediaSendOptions,
): FormData {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append(fieldName, new Blob([data]), options?.fileName ?? fieldName);
  if (options?.caption) formData.append('caption', options.caption);
  if (options?.parseMode) formData.append('parse_mode', options.parseMode);
  if (options?.replyToMessageId) {
    formData.append('reply_to_message_id', String(options.replyToMessageId));
  }
  return formData;
}

// ---------------------------------------------------------------------------
// Send functions (operate on a TelegramApi instance)
// ---------------------------------------------------------------------------

/** Send a text message. */
export async function sendMessage(
  api: TelegramApi,
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'MarkdownV2';
    replyToMessageId?: number;
    messageThreadId?: number;
  },
): Promise<TelegramMessage> {
  const params: Record<string, unknown> = { chat_id: chatId, text };
  if (options?.parseMode) params.parse_mode = options.parseMode;
  if (options?.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;
  if (options?.messageThreadId) params.message_thread_id = options.messageThreadId;

  return api.callMethod<TelegramMessage>('sendMessage', params);
}

/** Send a photo. */
export async function sendPhoto(
  api: TelegramApi,
  chatId: number | string,
  photo: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>('sendPhoto', buildMediaFormData(chatId, 'photo', photo, options));
}

/** Send a document. */
export async function sendDocument(
  api: TelegramApi,
  chatId: number | string,
  document: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>('sendDocument', buildMediaFormData(chatId, 'document', document, options));
}

/** Send an audio file. */
export async function sendAudio(
  api: TelegramApi,
  chatId: number | string,
  audio: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>('sendAudio', buildMediaFormData(chatId, 'audio', audio, options));
}

/** Send a video. */
export async function sendVideo(
  api: TelegramApi,
  chatId: number | string,
  video: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>('sendVideo', buildMediaFormData(chatId, 'video', video, options));
}

/** Send a voice message. */
export async function sendVoice(
  api: TelegramApi,
  chatId: number | string,
  voice: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>('sendVoice', buildMediaFormData(chatId, 'voice', voice, options));
}

/** Send a video note (round video). */
export async function sendVideoNote(
  api: TelegramApi,
  chatId: number | string,
  videoNote: Buffer,
  options?: { replyToMessageId?: number },
): Promise<TelegramMessage> {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('video_note', new Blob([videoNote]), 'video_note.mp4');
  if (options?.replyToMessageId) {
    formData.append('reply_to_message_id', String(options.replyToMessageId));
  }
  return api.sendFormData<TelegramMessage>('sendVideoNote', formData);
}

/** Send a sticker by file_id. */
export async function sendSticker(
  api: TelegramApi,
  chatId: number | string,
  sticker: string,
  options?: { replyToMessageId?: number },
): Promise<TelegramMessage> {
  const params: Record<string, unknown> = { chat_id: chatId, sticker };
  if (options?.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;
  return api.callMethod<TelegramMessage>('sendSticker', params);
}

/** Send an animation (GIF). */
export async function sendAnimation(
  api: TelegramApi,
  chatId: number | string,
  animation: Buffer,
  options?: MediaSendOptions,
): Promise<TelegramMessage> {
  return api.sendFormData<TelegramMessage>(
    'sendAnimation',
    buildMediaFormData(chatId, 'animation', animation, options),
  );
}
