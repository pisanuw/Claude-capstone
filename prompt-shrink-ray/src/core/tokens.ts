import type { TokenEstimate } from './types.js';

/**
 * Approximates token count without shipping a real tokenizer: providers'
 * own docs describe "roughly 4 characters per token" for English text, so
 * this uses that ratio, floored by word count so short or punctuation-heavy
 * strings are not under-counted. It will not match a real BPE tokenizer
 * exactly; it is a deterministic, offline estimate for comparing before vs.
 * after, not a billing-accurate count.
 */
export function estimateTokens(text: string): TokenEstimate {
  const characters = text.length;
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const estimatedTokens = characters === 0 ? 0 : Math.max(words, Math.ceil(characters / 4));
  return { characters, words, estimatedTokens };
}
