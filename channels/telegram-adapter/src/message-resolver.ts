/**
 * Message Type & File ID Resolver
 * Extracts message type and primary file ID from a Telegram message.
 */

import type { TelegramMessage, ChannelMessageType } from './types';

// ---------------------------------------------------------------------------
// Attachment metadata extracted from a Telegram message
// ---------------------------------------------------------------------------

export interface ResolvedAttachment {
  type: ChannelMessageType;
  fileId: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Message type resolution
// ---------------------------------------------------------------------------

/**
 * Determine the message type from a Telegram message.
 * Priority order matches Telegram's conventions: animation before video
 * (since animations have both animation and document fields).
 */
export function resolveMessageType(msg: TelegramMessage): ChannelMessageType {
  if (msg.photo && msg.photo.length > 0) return 'photo';
  if (msg.animation) return 'animation';
  if (msg.video) return 'video';
  if (msg.video_note) return 'video_note';
  if (msg.voice) return 'voice';
  if (msg.audio) return 'audio';
  if (msg.sticker) return 'sticker';
  if (msg.document) return 'document';
  if (msg.contact) return 'contact';
  if (msg.location) return 'location';
  return 'text';
}

// ---------------------------------------------------------------------------
// File ID resolution
// ---------------------------------------------------------------------------

/** Extract the primary file_id from a Telegram message, if it has a file attachment. */
export function resolveFileId(msg: TelegramMessage): string | undefined {
  if (msg.photo && msg.photo.length > 0) {
    return pickLargestPhoto(msg.photo);
  }
  if (msg.animation) return msg.animation.file_id;
  if (msg.video) return msg.video.file_id;
  if (msg.video_note) return msg.video_note.file_id;
  if (msg.voice) return msg.voice.file_id;
  if (msg.audio) return msg.audio.file_id;
  if (msg.sticker) return msg.sticker.file_id;
  if (msg.document) return msg.document.file_id;
  return undefined;
}

// ---------------------------------------------------------------------------
// Full attachment resolution
// ---------------------------------------------------------------------------

/** Extract all attachment metadata from a Telegram message. */
export function resolveAttachment(msg: TelegramMessage): ResolvedAttachment | undefined {
  if (msg.photo && msg.photo.length > 0) {
    const largest = pickLargestPhotoSize(msg.photo);
    return {
      type: 'photo',
      fileId: largest.file_id,
      fileSize: largest.file_size,
      width: largest.width,
      height: largest.height,
    };
  }

  if (msg.animation) {
    return {
      type: 'animation',
      fileId: msg.animation.file_id,
      mimeType: msg.animation.mime_type,
      fileSize: msg.animation.file_size,
      duration: msg.animation.duration,
      width: msg.animation.width,
      height: msg.animation.height,
    };
  }

  if (msg.video) {
    return {
      type: 'video',
      fileId: msg.video.file_id,
      mimeType: msg.video.mime_type,
      fileSize: msg.video.file_size,
      duration: msg.video.duration,
      width: msg.video.width,
      height: msg.video.height,
    };
  }

  if (msg.video_note) {
    return {
      type: 'video_note',
      fileId: msg.video_note.file_id,
      fileSize: msg.video_note.file_size,
      duration: msg.video_note.duration,
      width: msg.video_note.length,
      height: msg.video_note.length,
    };
  }

  if (msg.voice) {
    return {
      type: 'voice',
      fileId: msg.voice.file_id,
      mimeType: msg.voice.mime_type,
      fileSize: msg.voice.file_size,
      duration: msg.voice.duration,
    };
  }

  if (msg.audio) {
    return {
      type: 'audio',
      fileId: msg.audio.file_id,
      mimeType: msg.audio.mime_type,
      fileName: msg.audio.title,
      fileSize: msg.audio.file_size,
      duration: msg.audio.duration,
    };
  }

  if (msg.sticker) {
    return {
      type: 'sticker',
      fileId: msg.sticker.file_id,
      fileSize: msg.sticker.file_size,
      width: msg.sticker.width,
      height: msg.sticker.height,
    };
  }

  if (msg.document) {
    return {
      type: 'document',
      fileId: msg.document.file_id,
      mimeType: msg.document.mime_type,
      fileName: msg.document.file_name,
      fileSize: msg.document.file_size,
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickLargestPhotoSize(photos: NonNullable<TelegramMessage['photo']>) {
  return photos.reduce((a, b) =>
    (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b,
  );
}

function pickLargestPhoto(photos: NonNullable<TelegramMessage['photo']>): string {
  return pickLargestPhotoSize(photos).file_id;
}
