/**
 * Text folding with an offset map back to the original string.
 *
 * The verifier compares quotes against sources "after whitespace
 * normalization". PDFs and word processors also swap straight quotes for
 * curly ones and hyphens for dashes, so those are folded too. Everything
 * else (letters, digits, punctuation, spelling) must match exactly.
 */

export interface Folded {
  /** The folded text. */
  text: string;
  /** map[i] is the index in the original string of folded character i; map[text.length] is the original length. */
  map: number[];
}

const QUOTE_SINGLE = /[\u2018\u2019\u201A\u201B\u2032`\u00B4]/;
const QUOTE_DOUBLE = /[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/;
const DASH = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/;
const SPACE = /[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]/;
const INVISIBLE = /^(?:\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF)$/;

/** Folds one character, or returns '' to drop it. */
function foldChar(ch: string): string {
  if (QUOTE_SINGLE.test(ch)) return "'";
  if (QUOTE_DOUBLE.test(ch)) return '"';
  if (DASH.test(ch)) return '-';
  if (ch === '\u2026') return '...';
  if (INVISIBLE.test(ch)) return '';
  if (ch === '\uFB01') return 'fi';
  if (ch === '\uFB02') return 'fl';
  if (ch === '\uFB00') return 'ff';
  return ch;
}

/**
 * Folds typography and collapses every whitespace run to one space, trimming
 * both ends. The map lets a match in the folded text be turned back into a
 * span of the original.
 */
export function fold(s: string): Folded {
  let text = '';
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (SPACE.test(ch)) {
      if (pendingSpace < 0) pendingSpace = i;
      continue;
    }
    const f = foldChar(ch);
    if (!f) continue;
    if (pendingSpace >= 0 && text.length > 0) {
      text += ' ';
      map.push(pendingSpace);
    }
    pendingSpace = -1;
    for (const c of f) {
      text += c;
      map.push(i);
    }
  }
  map.push(s.length);
  return { text, map };
}

/** Folded form alone, for comparisons. */
export function foldText(s: string): string {
  return fold(s).text;
}

/**
 * Converts a [start, end) range in folded text back to the original string.
 * The end is placed just after the original character of the last folded one.
 */
export function unfoldRange(f: Folded, start: number, end: number): { start: number; end: number } {
  if (end <= start) return { start: f.map[start], end: f.map[start] };
  return { start: f.map[start], end: f.map[end - 1] + 1 };
}

/** Splits text into word tokens (letters and digits, with inner apostrophes and dots in numbers). */
export function words(s: string): string[] {
  return s.match(/[\p{L}\p{N}]+(?:['.][\p{L}\p{N}]+)*/gu) ?? [];
}

/** 32-bit FNV-1a hash as 8 hex digits; used for stable ids. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
