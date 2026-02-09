/**
 * Human-Like Behavior Plugin
 * Simulates natural response patterns for agent messaging channels.
 * Extracted from daemux-cli core as a standalone feature plugin.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HumanBehaviorConfig {
  typingDelayPerChar: number;
  minResponseDelay: number;
  maxResponseDelay: number;
  maxChunkLength: number;
  chunkPause: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: HumanBehaviorConfig = {
  typingDelayPerChar: 30,
  minResponseDelay: 1000,
  maxResponseDelay: 3000,
  maxChunkLength: 2000,
  chunkPause: 1500,
  enabled: false,
};

// ---------------------------------------------------------------------------
// Delay Helpers
// ---------------------------------------------------------------------------

const MIN_TYPING_DELAY = 500;
const MAX_TYPING_DELAY = 5000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Logger Interface (accepted via plugin API)
// ---------------------------------------------------------------------------

interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
}

let logger: Logger = { debug: () => {} };

// ---------------------------------------------------------------------------
// HumanBehavior Class
// ---------------------------------------------------------------------------

export class HumanBehavior {
  private config: HumanBehaviorConfig;

  constructor(config: HumanBehaviorConfig) {
    this.config = config;
  }

  calculateTypingDelay(text: string): number {
    const raw = text.length * this.config.typingDelayPerChar;
    return clamp(raw, MIN_TYPING_DELAY, MAX_TYPING_DELAY);
  }

  calculateResponseDelay(): number {
    const { minResponseDelay, maxResponseDelay } = this.config;
    return minResponseDelay + Math.random() * (maxResponseDelay - minResponseDelay);
  }

  chunkMessage(text: string, maxLength?: number): string[] {
    const limit = maxLength ?? this.config.maxChunkLength;
    if (text.length <= limit) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= limit) {
        chunks.push(remaining);
        break;
      }

      const cutIndex = this.findBreakPoint(remaining, limit);
      chunks.push(remaining.slice(0, cutIndex).trimEnd());
      remaining = remaining.slice(cutIndex).trimStart();
    }

    return chunks.filter((c) => c.length > 0);
  }

  async simulateHumanResponse(
    text: string,
    sendFn: (chunk: string) => Promise<void>,
    typingFn?: (active: boolean) => Promise<void>,
  ): Promise<void> {
    if (!this.config.enabled) {
      await sendFn(text);
      return;
    }

    const chunks = this.chunkMessage(text);
    const responseDelay = this.calculateResponseDelay();

    if (typingFn) {
      await typingFn(true);
    }
    await sleep(responseDelay);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;

      if (typingFn && i > 0) {
        await typingFn(true);
      }

      const typingDelay = this.calculateTypingDelay(chunk);
      await sleep(typingDelay);

      if (typingFn) {
        await typingFn(false);
      }

      await sendFn(chunk);

      if (i < chunks.length - 1) {
        await sleep(this.config.chunkPause);
      }
    }

    logger.debug('Human-like response delivered', {
      chunks: chunks.length,
      totalLength: text.length,
    });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): HumanBehaviorConfig {
    return { ...this.config };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private findBreakPoint(text: string, maxLength: number): number {
    const segment = text.slice(0, maxLength);

    const paragraphBreak = segment.lastIndexOf('\n\n');
    if (paragraphBreak > maxLength * 0.3) {
      return paragraphBreak + 2;
    }

    const sentenceMatch = this.findLastSentenceEnd(segment);
    if (sentenceMatch > maxLength * 0.3) {
      return sentenceMatch;
    }

    const lineBreak = segment.lastIndexOf('\n');
    if (lineBreak > maxLength * 0.3) {
      return lineBreak + 1;
    }

    const spaceBreak = segment.lastIndexOf(' ');
    if (spaceBreak > maxLength * 0.3) {
      return spaceBreak + 1;
    }

    return maxLength;
  }

  private findLastSentenceEnd(text: string): number {
    let lastEnd = -1;
    for (let i = text.length - 1; i >= 0; i--) {
      const char = text[i];
      if (char === '.' || char === '!' || char === '?') {
        const next = text[i + 1];
        if (next === ' ' || next === '\n' || next === undefined) {
          lastEnd = i + 1;
          break;
        }
      }
    }
    return lastEnd;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHumanBehavior(
  config?: Partial<HumanBehaviorConfig>,
): HumanBehavior {
  const merged: HumanBehaviorConfig = { ...DEFAULT_CONFIG, ...config };
  return new HumanBehavior(merged);
}

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

export const manifest = {
  name: 'daemux-human-behavior',
  version: '0.4.0',
  description: 'Human-like response behavior simulation for messaging channels',
};

// ---------------------------------------------------------------------------
// Plugin API Interface (minimal subset needed)
// ---------------------------------------------------------------------------

interface PluginAPI {
  log(level: string, message: string, data?: Record<string, unknown>): void;
  getState<T>(key: string): Promise<T | undefined>;
  setState<T>(key: string, value: T): Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin Lifecycle
// ---------------------------------------------------------------------------

let instance: HumanBehavior | null = null;

export async function activate(api: PluginAPI): Promise<void> {
  api.log('info', 'Activating human-behavior plugin');

  logger = {
    debug(message: string, data?: Record<string, unknown>) {
      api.log('debug', message, data);
    },
  };

  const savedConfig = await api.getState<Partial<HumanBehaviorConfig>>('human-behavior:config');
  instance = createHumanBehavior(savedConfig ?? undefined);

  api.log('info', 'Human-behavior plugin activated');
}

export async function deactivate(): Promise<void> {
  instance = null;
  logger = { debug: () => {} };
}

export function getBehavior(): HumanBehavior | null {
  return instance;
}

export default { manifest, activate, deactivate };
