/**
 * Anthropic Claude Model Definitions
 * Available models with their specifications
 */

export interface ClaudeModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  description: string;
}

/**
 * Claude model catalog
 * Models sorted by capability (most capable first)
 */
export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    description: 'Best balance of intelligence and speed',
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    description: 'Most capable model for complex tasks',
  },
  {
    id: 'claude-haiku-3-5-20250514',
    name: 'Claude Haiku 3.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    description: 'Fastest and most cost-effective',
  },
];

/**
 * Default model for general use
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Model used for context compaction (cheap and fast)
 */
export const COMPACTION_MODEL = 'claude-haiku-3-5-20250514';

/**
 * Get model by ID
 */
export function getModel(modelId: string): ClaudeModel | undefined {
  return CLAUDE_MODELS.find(m => m.id === modelId);
}

/**
 * Check if model ID is valid
 */
export function isValidModel(modelId: string): boolean {
  return CLAUDE_MODELS.some(m => m.id === modelId);
}
