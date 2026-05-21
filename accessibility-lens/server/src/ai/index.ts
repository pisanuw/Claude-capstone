import type { AiProvider } from './provider.js';
import { HeuristicProvider } from './heuristicProvider.js';
import { AnthropicProvider } from './anthropicProvider.js';

/**
 * Select a provider from configuration. If an Anthropic key is present we use
 * Claude; otherwise we fall back to the deterministic heuristic provider so
 * the app always works.
 */
export function createAiProvider(env: {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}): AiProvider {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    return new AnthropicProvider(key, env.ANTHROPIC_MODEL?.trim() || undefined);
  }
  return new HeuristicProvider();
}
