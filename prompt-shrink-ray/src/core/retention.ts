import { extractCodeFences } from './codeSafe.js';
import type { RetentionReport } from './types.js';

const QUOTED_RE = /"([^"]{2,})"|'([^']{2,})'/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const NUMBER_RE = /\b\d[\d,.]*\b/g;
// A capitalized word that is not the very first word of the text: a cheap
// proxy for proper nouns and named entities the compressor must not lose.
const CAPITALIZED_WORD_RE = /\b[A-Z][a-zA-Z]{2,}\b/g;

/**
 * Extracts the terms in `text` a human would consider load-bearing: fenced
 * code, inline code, quoted strings, numbers, and probable proper nouns.
 */
export function extractSalientTerms(text: string): string[] {
  const terms = new Set<string>();

  for (const fence of extractCodeFences(text)) {
    const inner = fence.replace(/```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
    if (inner.length > 0) terms.add(inner);
  }

  const withoutFences = text.replace(/```[\s\S]*?```/g, ' ');

  for (const match of withoutFences.matchAll(INLINE_CODE_RE)) {
    if (match[1]) terms.add(match[1].trim());
  }
  for (const match of withoutFences.matchAll(QUOTED_RE)) {
    const value = match[1] ?? match[2];
    if (value) terms.add(value.trim());
  }
  for (const match of withoutFences.matchAll(NUMBER_RE)) {
    terms.add(match[0]);
  }

  const firstWordEnd = withoutFences.search(/\s/);
  const rest = firstWordEnd === -1 ? '' : withoutFences.slice(firstWordEnd);
  for (const match of rest.matchAll(CAPITALIZED_WORD_RE)) {
    terms.add(match[0]);
  }

  return [...terms];
}

export function computeRetention(original: string, compressed: string): RetentionReport {
  const terms = extractSalientTerms(original);
  if (terms.length === 0) {
    return { score: 100, totalTerms: 0, retainedTerms: 0, missing: [] };
  }
  const missing = terms.filter((term) => !compressed.includes(term));
  const retainedTerms = terms.length - missing.length;
  const score = Math.round((retainedTerms / terms.length) * 100);
  return { score, totalTerms: terms.length, retainedTerms, missing };
}
