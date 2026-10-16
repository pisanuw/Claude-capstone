/**
 * Sequences in and out: parsing a pasted string, generating a fair-coin
 * baseline, and backend-free share links. A link carries the mode and the
 * raw presses; the score is recomputed by replaying the oracle on open, so a
 * link cannot claim a better result than its sequence earns.
 */

import type { Bit, Mode } from './predictor';

export const MAX_SEQUENCE = 2000;

export type ParseResult = { ok: true; bits: Bit[]; symbols: [string, string] } | { ok: false; error: string };

const KNOWN_PAIRS: [string, string][] = [
  ['F', 'J'],
  ['0', '1'],
  ['H', 'T'],
  ['L', 'R'],
];

/**
 * Turn pasted text into bits. Whitespace and commas are ignored, letters are
 * case-insensitive, and at most two distinct symbols are allowed. Known pairs
 * keep their natural order (F/J, 0/1, H/T, L/R); anything else maps the first
 * symbol seen to F.
 */
export function parseSequence(text: string): ParseResult {
  const chars = text.toUpperCase().replace(/[\s,;]+/g, '');
  if (chars.length === 0) return { ok: false, error: 'Paste at least a few symbols, e.g. FJJFJ or 0110.' };
  if (chars.length > MAX_SEQUENCE) return { ok: false, error: `That is ${chars.length} symbols; the limit is ${MAX_SEQUENCE}.` };
  const distinct = [...new Set(chars)];
  if (distinct.length > 2) {
    return { ok: false, error: `Use exactly two symbols; found ${distinct.length}: ${distinct.slice(0, 6).join(' ')}${distinct.length > 6 ? ' ...' : ''}.` };
  }
  const pair =
    KNOWN_PAIRS.find(([a, b]) => distinct.every((c) => c === a || c === b)) ??
    ([distinct[0]!, distinct[1] ?? distinct[0]!] as [string, string]);
  const bits = [...chars].map((c) => (c === pair[0] ? 0 : 1) as Bit);
  return { ok: true, bits, symbols: pair };
}

export function bitsToKeys(bits: readonly Bit[]): string {
  return bits.map((b) => (b === 0 ? 'F' : 'J')).join('');
}

/** A genuinely random baseline from the browser's CSPRNG. */
export function coinFlips(n: number, random: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): Bit[] {
  const bytes = random(new Uint8Array(Math.ceil(n / 8)));
  const bits: Bit[] = [];
  for (let i = 0; i < n; i++) bits.push(((bytes[i >> 3]! >> (i & 7)) & 1) as Bit);
  return bits;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Pack bits six to a character, base64url alphabet, low bit first. */
export function packBits(bits: readonly Bit[]): string {
  let out = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let j = 0; j < 6 && i + j < bits.length; j++) v |= bits[i + j]! << j;
    out += B64[v];
  }
  return out;
}

export function unpackBits(text: string, length: number): Bit[] | null {
  if (!Number.isInteger(length) || length < 0 || Math.ceil(length / 6) !== text.length) return null;
  const bits: Bit[] = [];
  for (let i = 0; i < length; i++) {
    const v = B64.indexOf(text[Math.floor(i / 6)]!);
    if (v < 0) return null;
    bits.push(((v >> i % 6) & 1) as Bit);
  }
  return bits;
}

export interface SharedRun {
  mode: Mode;
  bits: Bit[];
  /** Where the sequence came from, shown on the results panel. */
  source: 'played' | 'pasted' | 'coin';
}

const SOURCES: SharedRun['source'][] = ['played', 'pasted', 'coin'];

export function encodeShare(run: SharedRun): string {
  const params = new URLSearchParams({ m: run.mode, src: run.source, n: String(run.bits.length), s: packBits(run.bits) });
  return params.toString();
}

export function decodeShare(hash: string): SharedRun | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const mode = params.get('m');
  const source = (params.get('src') ?? 'played') as SharedRun['source'];
  const n = Number(params.get('n'));
  const s = params.get('s');
  if ((mode !== 'easy' && mode !== 'hard') || !SOURCES.includes(source) || s === null) return null;
  if (n < 1 || n > MAX_SEQUENCE) return null;
  const bits = unpackBits(s, n);
  return bits ? { mode, bits, source } : null;
}
