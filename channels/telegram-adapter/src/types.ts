/**
 * Telegram Bot API Type Definitions
 * Covers all message types, media attachments, and API responses.
 */

// ---------------------------------------------------------------------------
// User & Chat
// ---------------------------------------------------------------------------

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
}

// ---------------------------------------------------------------------------
// Media Types
// ---------------------------------------------------------------------------

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideoNote {
  file_id: string;
  file_unique_id: string;
  length: number;
  duration: number;
  file_size?: number;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  type: 'regular' | 'mask' | 'custom_emoji';
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
  set_name?: string;
  file_size?: number;
}

export interface TelegramAnimation {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

export interface TelegramLocation {
  longitude: number;
  latitude: number;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  message_thread_id?: number;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  voice?: TelegramVoice;
  video_note?: TelegramVideoNote;
  sticker?: TelegramSticker;
  animation?: TelegramAnimation;
  contact?: TelegramContact;
  location?: TelegramLocation;
  forward_date?: number;
  forward_from?: TelegramUser;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

// ---------------------------------------------------------------------------
// API Response & File Info
// ---------------------------------------------------------------------------

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

export interface TelegramFileInfo {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

// ---------------------------------------------------------------------------
// Bot Info (getMe response)
// ---------------------------------------------------------------------------

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

// ---------------------------------------------------------------------------
// Channel Configuration
// ---------------------------------------------------------------------------

export interface TelegramChannelConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Allowed user IDs (whitelist). Empty array = allow all. */
  allowedUserIds: number[];
  /** Long-polling timeout in seconds (default: 30) */
  pollTimeoutSec?: number;
  /** Maximum file download size in bytes (default: 20MB) */
  maxFileSize?: number;
}

// ---------------------------------------------------------------------------
// Channel Message Type (mirrors daemux-cli ChannelMessageType)
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
