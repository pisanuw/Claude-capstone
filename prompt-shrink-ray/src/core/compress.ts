import { applyOutsideCodeFences } from './codeSafe.js';
import { decomposePrompt } from './decompose.js';
import { FILLER_WORDS, HEDGE_WORDS, VERBOSE_PHRASES, applyPhraseRules } from './rules.js';
import { normalizeSentence, splitSentences } from './sentences.js';
import type { Aggressiveness, CompressedSection, CompressionResult, Section } from './types.js';

export function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function trimExampleGroups(text: string): { text: string; applied: boolean } {
  const match = text.match(/\bexample\s*\d+\s*:/i);
  if (!match || match.index === undefined) return { text, applied: false };
  const preamble = text.slice(0, match.index);
  const rest = text.slice(match.index);
  const parts = rest.split(/(?=\bexample\s*\d+\s*:)/gi).filter((p) => p.trim().length > 0);
  if (parts.length <= 2) return { text, applied: false };
  const kept = parts.slice(0, 2).join('').trimEnd();
  const extra = parts.length - 2;
  return {
    text: `${preamble}${kept}\n\n(+${extra} more example${extra === 1 ? '' : 's'} omitted for brevity)`,
    applied: true,
  };
}

function dedupSentences(text: string, seen: Set<string>): { text: string; applied: boolean } {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { text, applied: false };
  const kept: string[] = [];
  let applied = false;
  for (const sentence of sentences) {
    const key = normalizeSentence(sentence);
    if (key.length > 0 && seen.has(key)) {
      applied = true;
      continue;
    }
    if (key.length > 0) seen.add(key);
    kept.push(sentence);
  }
  return { text: kept.join(' ').trim(), applied };
}

/**
 * Compresses one section's text at the given aggressiveness level. Rules run
 * outside fenced code blocks only, and cross-section sentence dedup is
 * skipped for `example` sections so repeated sample structure survives.
 */
export function compressSectionText(
  section: Section,
  level: Aggressiveness,
  seenSentences: Set<string>,
): CompressedSection {
  const before = section.text;
  const rulesApplied: string[] = [];
  let text = before;

  text = applyOutsideCodeFences(text, normalizeWhitespace);
  if (text !== before) rulesApplied.push('whitespace');

  const filler = applyOutsideCodeFences(text, (segment) => applyPhraseRules(segment, FILLER_WORDS).text);
  if (filler !== text) rulesApplied.push('filler-words');
  text = applyOutsideCodeFences(filler, normalizeWhitespace);

  if (level === 'medium' || level === 'aggressive') {
    const verbose = applyOutsideCodeFences(text, (segment) => applyPhraseRules(segment, VERBOSE_PHRASES).text);
    if (verbose !== text) rulesApplied.push('verbose-phrases');
    text = verbose;

    if (section.kind !== 'example') {
      // Fence-protected: a fenced code block is hidden behind a single
      // placeholder token while splitting into sentences, so periods inside
      // code (and the code's own line breaks) never affect, or are affected
      // by, sentence-level dedup.
      const deduped = applyOutsideCodeFences(text, (segment) => {
        const result = dedupSentences(segment, seenSentences);
        if (result.applied) rulesApplied.push('dedup-sentences');
        return result.text;
      });
      text = deduped;
    }
  }

  if (level === 'aggressive') {
    const hedged = applyOutsideCodeFences(text, (segment) => applyPhraseRules(segment, HEDGE_WORDS).text);
    if (hedged !== text) rulesApplied.push('hedge-words');
    text = applyOutsideCodeFences(hedged, normalizeWhitespace);

    if (section.kind === 'example') {
      const trimmed = trimExampleGroups(text);
      if (trimmed.applied) rulesApplied.push('trim-examples');
      text = trimmed.text;
    }
  }

  text = applyOutsideCodeFences(text, normalizeWhitespace);
  return { kind: section.kind, before, after: text, rulesApplied };
}

export function compressPrompt(originalText: string, level: Aggressiveness): CompressionResult {
  const sections = decomposePrompt(originalText);
  const seenSentences = new Set<string>();
  const compressed = sections
    .map((section) => compressSectionText(section, level, seenSentences))
    .filter((section) => section.after.trim().length > 0);

  return {
    sections: compressed,
    originalText,
    compressedText: compressed.map((s) => s.after).join('\n\n'),
  };
}
