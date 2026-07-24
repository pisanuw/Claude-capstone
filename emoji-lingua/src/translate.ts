/**
 * Pure, deterministic dictionary translation. No I/O, no model calls, so every
 * case is unit-testable and the app works offline / with no API key.
 */
import { WORD_TO_EMOJI, PHRASE_TO_EMOJI, EMOJI_TO_WORD } from './dictionary.js';

export type Direction = 'to-emoji' | 'to-english';
export type Mode = 'literal' | 'interpretive';

export interface TranslationResult {
  output: string;
  /** Which engine produced it, surfaced in the UI for honesty. */
  engine: 'dictionary' | 'ai';
  /** Words we had no emoji for (to-emoji only), for a gentle UI hint. */
  untranslated: string[];
}

/**
 * Split emoji from a string. Uses Intl.Segmenter when available so multi
 * codepoint emoji (families, skin tones, ZWJ sequences) stay intact, with a
 * regex fallback for older runtimes.
 */
export function splitEmoji(text: string): string[] {
  const out: string[] = [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    for (const { segment } of seg.segment(text)) {
      if (segment.trim()) out.push(segment);
    }
    return out;
  }
  for (const ch of Array.from(text)) {
    if (ch.trim()) out.push(ch);
  }
  return out;
}

/** True when the string contains at least one emoji-ish (non-ASCII pictograph). */
export function looksLikeEmoji(text: string): boolean {
  return /[\p{Extended_Pictographic}]/u.test(text);
}

/** Normalize a word for dictionary lookup: lowercase, strip punctuation. */
function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

/**
 * Try a few simple morphological variants so "cats", "running", "loved" hit
 * their dictionary entries. Intentionally small: this is a toy translator, not
 * a stemmer, and over-aggressive stemming produces worse results.
 */
function lookupWord(word: string): string | undefined {
  const w = normalize(word);
  if (!w) return undefined;
  if (WORD_TO_EMOJI[w]) return WORD_TO_EMOJI[w];
  const variants: string[] = [];
  if (w.endsWith('s') && w.length > 3) variants.push(w.slice(0, -1));
  if (w.endsWith('es') && w.length > 4) variants.push(w.slice(0, -2));
  if (w.endsWith('ing') && w.length > 5) {
    variants.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  }
  if (w.endsWith('ed') && w.length > 4) {
    variants.push(w.slice(0, -2), w.slice(0, -1));
  }
  // Adjective forms: "rainy" -> "rain", "sunny" -> "sun", "funny" stays unknown.
  if (w.endsWith('y') && w.length > 3) {
    variants.push(w.slice(0, -1));
    // doubled consonant: "sunny" -> "sun", "foggy" -> "fog"
    const base = w.slice(0, -1);
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      variants.push(base.slice(0, -1));
    }
  }
  for (const v of variants) {
    if (WORD_TO_EMOJI[v]) return WORD_TO_EMOJI[v];
  }
  return undefined;
}

/**
 * English -> emoji. Replaces every word we know with its emoji and leaves the
 * rest of the text intact, which reads better than dropping unknown words.
 */
export function englishToEmoji(text: string): TranslationResult {
  if (!text.trim()) return { output: '', engine: 'dictionary', untranslated: [] };

  let working = text;
  // Phrases first (longest first) so "ice cream" beats "ice" + "cream".
  const phrases = Object.keys(PHRASE_TO_EMOJI).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    working = working.replace(re, PHRASE_TO_EMOJI[phrase]);
  }

  const untranslated: string[] = [];
  const output = working
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token; // preserve whitespace
      if (looksLikeEmoji(token)) return token; // already substituted
      const emoji = lookupWord(token);
      if (emoji) {
        // Carry trailing punctuation through, e.g. "cat," -> "🐱,"
        const trailing = token.match(/[.,!?;:]+$/)?.[0] ?? '';
        return emoji + trailing;
      }
      const norm = normalize(token);
      if (norm) untranslated.push(norm);
      return token;
    })
    .join('');

  return { output, engine: 'dictionary', untranslated };
}

/**
 * Emoji -> English (literal gloss). Each known emoji becomes its word; unknown
 * emoji are kept as-is so the user can see what was not understood.
 */
export function emojiToEnglish(text: string): TranslationResult {
  if (!text.trim()) return { output: '', engine: 'dictionary', untranslated: [] };

  const parts = splitEmoji(text);
  const words: string[] = [];
  for (const part of parts) {
    const word = EMOJI_TO_WORD[part];
    if (word) {
      words.push(word);
      continue;
    }
    // Try the emoji without a variation selector (e.g. ❤️ -> ❤).
    const stripped = part.replace(/[\uFE0F\uFE0E]/g, '');
    if (EMOJI_TO_WORD[stripped]) {
      words.push(EMOJI_TO_WORD[stripped]);
      continue;
    }
    words.push(part); // unknown: pass through
  }
  return { output: words.join(' '), engine: 'dictionary', untranslated: [] };
}

/** Dispatch on direction. */
export function translate(text: string, direction: Direction): TranslationResult {
  return direction === 'to-emoji' ? englishToEmoji(text) : emojiToEnglish(text);
}
