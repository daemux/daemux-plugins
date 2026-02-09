/**
 * Transcription Provider Type Definitions
 */

// ---------------------------------------------------------------------------
// Transcription Options & Results
// ---------------------------------------------------------------------------

export interface TranscriptionOptions {
  model?: string;
  language?: string;
  responseFormat?: 'text' | 'json' | 'verbose_json';
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Transcription Provider Interface
// ---------------------------------------------------------------------------

export interface TranscriptionProvider {
  readonly id: string;
  transcribe(
    audio: Buffer,
    fileName: string,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
