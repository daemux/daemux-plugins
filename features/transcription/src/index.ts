/**
 * Transcription Plugin
 * OpenAI audio transcription provider for voice messages.
 * Registers as a TranscriptionProvider via the plugin API.
 */

import { z } from 'zod';
import type { TranscriptionProvider, TranscriptionOptions, TranscriptionResult } from '@daemux/plugin-sdk';

export type { TranscriptionProvider, TranscriptionOptions, TranscriptionResult } from '@daemux/plugin-sdk';

// ---------------------------------------------------------------------------
// Response Validation Schema
// ---------------------------------------------------------------------------

const TranscriptionResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Retry Configuration
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = [429, 500, 502, 503];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// OpenAI Transcription Provider
// ---------------------------------------------------------------------------

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openai';
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async transcribe(
    audio: Buffer,
    fileName: string,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const model = options?.model ?? 'gpt-4o-transcribe';
    const responseFormat = options?.responseFormat ?? 'json';
    const normalizedFileName = normalizeAudioExtension(fileName);

    const response = await this.fetchWithRetry(audio, normalizedFileName, model, responseFormat, options);

    if (responseFormat === 'text') {
      return { text: await response.text() };
    }

    return TranscriptionResultSchema.parse(await response.json());
  }

  private async fetchWithRetry(
    audio: Buffer,
    fileName: string,
    model: string,
    responseFormat: string,
    options?: TranscriptionOptions,
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const formData = new FormData();
      const mimeType = resolveAudioMimeType(fileName);
      formData.append('file', new Blob([audio], { type: mimeType }), fileName);
      formData.append('model', model);
      formData.append('response_format', responseFormat);
      if (options?.language) {
        formData.append('language', options.language);
      }

      const response = await fetch(
        `${this.baseUrl}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: formData,
          signal: AbortSignal.timeout(120_000),
        },
      );

      if (response.ok) {
        return response;
      }

      if (attempt < MAX_RETRIES && RETRYABLE_STATUSES.includes(response.status)) {
        lastError = new Error(
          `Transcription failed (${response.status}), retrying (${attempt + 1}/${MAX_RETRIES})`,
        );
        continue;
      }

      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(
        `Transcription failed (${response.status}): ${errorText}`,
      );
    }

    throw lastError ?? new Error('Transcription failed after retries');
  }
}

// ---------------------------------------------------------------------------
// Audio Extension Normalization
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, string> = {
  '.oga': '.ogg',
  '.opus': '.ogg',
  '.wma': '.mp3',
  '.aac': '.m4a',
  '.3gp': '.mp4',
};

function normalizeAudioExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return `${fileName}.ogg`;

  const ext = fileName.slice(dotIndex).toLowerCase();
  const mapped = EXTENSION_MAP[ext];
  if (!mapped) return fileName;

  return fileName.slice(0, dotIndex) + mapped;
}

const MIME_MAP: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.webm': 'audio/webm',
  '.mpga': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
};

function resolveAudioMimeType(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return 'audio/ogg';

  const ext = fileName.slice(dotIndex).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTranscriptionProvider(
  config: { apiKey: string; baseUrl?: string },
): TranscriptionProvider {
  return new OpenAITranscriptionProvider(config);
}

// ---------------------------------------------------------------------------
// Plugin Manifest & Lifecycle
// ---------------------------------------------------------------------------

export const manifest = {
  name: '@daemux/transcription',
  version: '1.0.0',
  description: 'OpenAI audio transcription provider for daemux',
  author: 'daemux',
};

export default { manifest, createTranscriptionProvider };
