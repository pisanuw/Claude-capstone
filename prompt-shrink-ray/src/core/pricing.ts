import type { ModelPricing } from './types.js';

/**
 * Illustrative input-token pricing for a handful of well-known models, USD
 * per 1,000,000 tokens. These are static reference figures baked in at build
 * time, not fetched live, and providers change pricing over time: treat the
 * dollar figures as illustrative and check the provider's current pricing
 * page before budgeting. The percentage savings this tool reports do not
 * depend on these numbers being exact, since they cancel out in the ratio.
 */
export const MODEL_PRICING: ModelPricing[] = [
  { id: 'claude-haiku', label: 'Claude Haiku', inputPerMillion: 0.8 },
  { id: 'claude-sonnet', label: 'Claude Sonnet', inputPerMillion: 3 },
  { id: 'claude-opus', label: 'Claude Opus', inputPerMillion: 15 },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPerMillion: 0.15 },
  { id: 'gpt-4o', label: 'GPT-4o', inputPerMillion: 2.5 },
];

export function estimateCost(tokens: number, pricing: ModelPricing): number {
  return (tokens / 1_000_000) * pricing.inputPerMillion;
}

export function findPricing(id: string): ModelPricing {
  return MODEL_PRICING.find((p) => p.id === id) ?? MODEL_PRICING[0];
}
