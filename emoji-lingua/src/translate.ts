/**
 * Pure, deterministic dictionary translation. No I/O, no model calls, so every
 * case is unit-testable and the app works offline / with no API key.
 *
 * The dictionary is generated from Unicode CLDR emoji annotations plus
 * hand-authored layers (see tools/build-dictionary.mjs). This module holds only
 * the matching logic:
 *   - multi-word phrases matched greedily, longest first ("ice cream" beats
 *     "ice" + "cream"),
 *   - then single words,
 *   - then a morphological fallback (plural, -ing/-ed/-ly/-y/-ness/-tion),
 *   - words mapped to '' (articles) are dropped so output reads cleanly.
 */
import { WORD_TO_EMOJI, EMOJI_TO_WORD } from './generated-dictionary.js';

export type Direction = 'to-emoji' | 'to-english';
export type Mode = 'literal' | 'interpretive';

export interface TranslationResult {
  output: string;
  /** Which engine produced it, surfaced in the UI for honesty. */
  engine: 'dictionary' | 'ai';
  /** Words we had no emoji for (to-emoji only), for a gentle UI hint. */
  untranslated: string[];
}

/** Longest phrase (in words) we will try to match. */
const MAX_PHRASE_WORDS = 4;

/**
 * Split emoji from a string. Uses Intl.Segmenter when available so multi
 * codepoint emoji (families, skin tones, ZWJ sequences) stay intact, with a
 * per-codepoint fallback for older runtimes.
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

/** True when the string contains at least one emoji-ish (pictographic) char. */
export function looksLikeEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

/** Normalize a token for dictionary lookup: lowercase, strip punctuation. */
function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

/**
 * Look up a single word, trying morphological variants so inflected forms
 * resolve even when the generator did not materialize them.
 */
function lookupWord(word: string): string | undefined {
  const w = normalize(word);
  if (!w) return undefined;
  const direct = WORD_TO_EMOJI[w];
  if (direct !== undefined) return direct;

  const variants: string[] = [];
  if (w.endsWith('ies') && w.length > 4) variants.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 3) variants.push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 3) variants.push(w.slice(0, -1));
  if (w.endsWith('ing') && w.length > 5) {
    variants.push(w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -4));
  }
  if (w.endsWith('ed') && w.length > 4) {
    variants.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
  }
  if (w.endsWith('ly') && w.length > 4) variants.push(w.slice(0, -2));
  if (w.endsWith('y') && w.length > 3) {
    variants.push(w.slice(0, -1));
    const base = w.slice(0, -1);
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      variants.push(base.slice(0, -1));
    }
  }
  if (w.endsWith('er') && w.length > 4) variants.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('ness') && w.length > 5) variants.push(w.slice(0, -4));
  if (w.endsWith('tion') && w.length > 6) variants.push(w.slice(0, -4) + 'te', w.slice(0, -4));
  if (w.endsWith('sion') && w.length > 6) variants.push(w.slice(0, -4) + 'd', w.slice(0, -4));
  if (w.endsWith('ment') && w.length > 6) variants.push(w.slice(0, -4));
  if (w.endsWith('ity') && w.length > 5) variants.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ical') && w.length > 6) variants.push(w.slice(0, -4), w.slice(0, -4) + 'y');
  if (w.endsWith('ic') && w.length > 4) variants.push(w.slice(0, -2), w.slice(0, -2) + 'y');
  if (w.endsWith('al') && w.length > 4) variants.push(w.slice(0, -2), w.slice(0, -2) + 'e');
  if (w.endsWith('ive') && w.length > 5) variants.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ous') && w.length > 5) variants.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ful') && w.length > 5) {
    variants.push(w.slice(0, -3), w.slice(0, -4) + 'y');
  }
  if (w.endsWith('less') && w.length > 6) variants.push(w.slice(0, -4));
  if (w.endsWith('able') && w.length > 6) variants.push(w.slice(0, -4), w.slice(0, -4) + 'e');
  if (w.endsWith('est') && w.length > 5) variants.push(w.slice(0, -3));

  for (const v of variants) {
    const hit = WORD_TO_EMOJI[v];
    if (hit !== undefined && hit !== '') return hit;
  }
  return undefined;
}

interface Token {
  text: string;
  isWord: boolean;
}

/** Tokenize into words and everything else, preserving the original text. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /([A-Za-z][A-Za-z']*)|([^A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], isWord: Boolean(m[1]) });
  }
  return tokens;
}

/**
 * English -> emoji. Greedy longest-match over phrases, then words. Unknown
 * words are kept in place (which reads better than dropping them) and counted.
 */
export function englishToEmoji(text: string): TranslationResult {
  if (!text.trim()) return { output: '', engine: 'dictionary', untranslated: [] };

  const tokens = tokenize(text);
  const wordIndexes: number[] = [];
  tokens.forEach((t, i) => {
    if (t.isWord) wordIndexes.push(i);
  });

  const replacement = new Map<number, string>();
  const consumed = new Set<number>();
  const untranslated: string[] = [];

  for (let wi = 0; wi < wordIndexes.length; wi++) {
    const idx = wordIndexes[wi];
    if (consumed.has(idx)) continue;

    let matched = false;
    for (let n = Math.min(MAX_PHRASE_WORDS, wordIndexes.length - wi); n >= 2; n--) {
      const slice = wordIndexes.slice(wi, wi + n);
      const key = slice.map((i) => normalize(tokens[i].text)).join('_');
      const hit = WORD_TO_EMOJI[key];
      if (hit !== undefined) {
        replacement.set(idx, hit);
        for (const i of slice.slice(1)) {
          consumed.add(i);
          replacement.set(i, '');
        }
        wi += n - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const single = lookupWord(tokens[idx].text);
    if (single !== undefined) {
      replacement.set(idx, single);
    } else {
      const norm = normalize(tokens[idx].text);
      if (norm) untranslated.push(norm);
    }
  }

  let output = tokens.map((t, i) => (replacement.has(i) ? replacement.get(i)! : t.text)).join('');
  output = output.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?;:])/g, '$1').trim();

  return { output, engine: 'dictionary', untranslated };
}

/**
 * Emoji -> English (literal gloss). Each known emoji becomes its word; unknown
 * emoji pass through so the user can see what was not understood.
 */
export function emojiToEnglish(text: string): TranslationResult {
  if (!text.trim()) return { output: '', engine: 'dictionary', untranslated: [] };

  const parts = splitEmoji(text);
  const words: string[] = [];
  for (const part of parts) {
    const direct = EMOJI_TO_WORD[part];
    if (direct) {
      words.push(direct.replace(/_/g, ' '));
      continue;
    }
    const stripped = part.replace(/[\uFE0F\uFE0E]/g, '');
    const alt = EMOJI_TO_WORD[stripped];
    if (alt) {
      words.push(alt.replace(/_/g, ' '));
      continue;
    }
    words.push(part);
  }
  return { output: words.join(' '), engine: 'dictionary', untranslated: [] };
}

/** Dispatch on direction. */
export function translate(text: string, direction: Direction): TranslationResult {
  return direction === 'to-emoji' ? englishToEmoji(text) : emojiToEnglish(text);
}
