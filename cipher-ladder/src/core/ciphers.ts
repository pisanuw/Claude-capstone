/**
 * The six classical ciphers of the ladder: encryption with a full key, and
 * decryption with a student's possibly incomplete key, where every letter the
 * student has not pinned down yet renders as `_`.
 */
import type { Rng } from './rng.js';
import { ALPHABET, ENGLISH_FREQ, indexLetter, letterIndex, modInverse26, onlyLetters, AFFINE_MULTIPLIERS } from './text.js';

export type CipherType = 'caesar' | 'affine' | 'substitution' | 'vigenere' | 'columnar' | 'homophonic';

export const CIPHER_ORDER: CipherType[] = ['caesar', 'affine', 'substitution', 'vigenere', 'columnar', 'homophonic'];

export const CIPHER_LABEL: Record<CipherType, string> = {
  caesar: 'Caesar shift',
  affine: 'Affine',
  substitution: 'Monoalphabetic substitution',
  vigenere: 'Vigenere',
  columnar: 'Columnar transposition',
  homophonic: 'Homophonic substitution',
};

export type Key =
  | { type: 'caesar'; shift: number }
  | { type: 'affine'; a: number; b: number }
  /** `alphabet[i]` is the ciphertext letter that stands for plaintext letter i. */
  | { type: 'substitution'; alphabet: string }
  | { type: 'vigenere'; keyword: string }
  | { type: 'columnar'; keyword: string }
  /** Each plaintext letter maps to one or more two-digit symbols. */
  | { type: 'homophonic'; table: Record<string, string[]> };

/** A student's working key. Missing parts are `null`, `?`, or absent map entries. */
export type StudentKey =
  | { type: 'caesar'; shift: number | null }
  | { type: 'affine'; a: number | null; b: number | null }
  /** cipher letter -> plain letter */
  | { type: 'substitution'; map: Record<string, string> }
  /** `?` marks an unknown keyword letter. */
  | { type: 'vigenere'; keyword: string }
  /** Read order of the columns; `null` for a slot not yet placed. */
  | { type: 'columnar'; order: (number | null)[] }
  /** symbol -> plain letter */
  | { type: 'homophonic'; map: Record<string, string> };

export const UNKNOWN = '_';

// ---------------------------------------------------------------- columnar

/** Column read order for a keyword: the position of each letter in sorted order. */
export function keywordOrder(keyword: string): number[] {
  const letters = onlyLetters(keyword).split('');
  return letters
    .map((ch, i) => ({ ch, i }))
    .sort((x, y) => (x.ch === y.ch ? x.i - y.i : x.ch < y.ch ? -1 : 1))
    .map((x) => x.i);
}

/** Length of each of the `cols` columns when `n` letters are written row by row. */
export function columnLengths(n: number, cols: number): number[] {
  const base = Math.floor(n / cols);
  const extra = n % cols;
  return Array.from({ length: cols }, (_, i) => base + (i < extra ? 1 : 0));
}

function columnarEncrypt(plain: string, order: number[]): string {
  const cols = order.length;
  let out = '';
  for (const c of order) for (let i = c; i < plain.length; i += cols) out += plain[i];
  return out;
}

function columnarDecrypt(cipher: string, order: (number | null)[]): string {
  const cols = order.length;
  if (cols === 0) return UNKNOWN.repeat(cipher.length);
  const lengths = columnLengths(cipher.length, cols);
  const out = new Array<string>(cipher.length).fill(UNKNOWN);
  let pos = 0;
  const seen = new Set<number>();
  for (const c of order) {
    // A duplicated or out-of-range slot cannot be placed; its chunk is skipped.
    if (c === null || c < 0 || c >= cols || seen.has(c)) {
      pos += c !== null && c >= 0 && c < cols ? lengths[c] : 0;
      continue;
    }
    seen.add(c);
    const chunk = cipher.slice(pos, pos + lengths[c]);
    pos += lengths[c];
    for (let r = 0; r < chunk.length; r++) out[c + r * cols] = chunk[r];
  }
  return out.join('');
}

// -------------------------------------------------------------- homophonic

/**
 * Builds a homophonic table over `symbolCount` of the symbols 00-99, giving
 * each letter a number of symbols roughly proportional to its English
 * frequency (E gets several, Z gets one), so the ciphertext's symbol
 * frequencies come out flatter than the plaintext's.
 */
export function makeHomophonicTable(rng: Rng, symbolCount = 45): Record<string, string[]> {
  const size = Math.min(100, Math.max(26, Math.round(symbolCount)));
  const symbols = rng.shuffle(Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'))).slice(0, size);
  // One symbol each, then hand out the rest to the letters whose frequency
  // is least covered, so the ciphertext histogram comes out as flat as possible.
  const alloc = new Array<number>(26).fill(1);
  for (let given = 26; given < size; given++) {
    let best = 0;
    let bestGap = -Infinity;
    for (let i = 0; i < 26; i++) {
      const gap = ENGLISH_FREQ[ALPHABET[i]] / alloc[i];
      if (gap > bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    alloc[best]++;
  }
  const table: Record<string, string[]> = {};
  let k = 0;
  ALPHABET.split('').forEach((ch, i) => {
    table[ch] = symbols.slice(k, k + alloc[i]).sort();
    k += alloc[i];
  });
  return table;
}

/** Splits a homophonic ciphertext ("17 04 88 ...") into its symbols. */
export function homophonicSymbols(cipher: string): string[] {
  return cipher.split(/\s+/).filter((s) => /^\d\d$/.test(s));
}

// ------------------------------------------------------------- encryption

/**
 * Encrypts `plaintext` (anything; non-letters are dropped) with a full key.
 * For homophonic ciphers `rng` picks among a letter's symbols; without it the
 * first symbol is always used.
 */
export function encrypt(plaintext: string, key: Key, rng?: Rng): string {
  const p = onlyLetters(plaintext);
  switch (key.type) {
    case 'caesar':
      return p.replace(/[A-Z]/g, (ch) => indexLetter(letterIndex(ch) + key.shift));
    case 'affine':
      return p.replace(/[A-Z]/g, (ch) => indexLetter(key.a * letterIndex(ch) + key.b));
    case 'substitution':
      return p.replace(/[A-Z]/g, (ch) => key.alphabet[letterIndex(ch)]);
    case 'vigenere': {
      const k = onlyLetters(key.keyword);
      return p
        .split('')
        .map((ch, i) => indexLetter(letterIndex(ch) + letterIndex(k[i % k.length])))
        .join('');
    }
    case 'columnar':
      return columnarEncrypt(p, keywordOrder(key.keyword));
    case 'homophonic':
      return p
        .split('')
        .map((ch) => {
          const choices = key.table[ch];
          return rng ? rng.pick(choices) : choices[0];
        })
        .join(' ');
  }
}

/** The complete student key equivalent to a full key (used for solutions and hints). */
export function fullStudentKey(key: Key): StudentKey {
  switch (key.type) {
    case 'caesar':
      return { type: 'caesar', shift: key.shift };
    case 'affine':
      return { type: 'affine', a: key.a, b: key.b };
    case 'substitution': {
      const map: Record<string, string> = {};
      for (let i = 0; i < 26; i++) map[key.alphabet[i]] = ALPHABET[i];
      return { type: 'substitution', map };
    }
    case 'vigenere':
      return { type: 'vigenere', keyword: onlyLetters(key.keyword) };
    case 'columnar':
      return { type: 'columnar', order: keywordOrder(key.keyword) };
    case 'homophonic': {
      const map: Record<string, string> = {};
      for (const [letter, symbols] of Object.entries(key.table)) for (const s of symbols) map[s] = letter;
      return { type: 'homophonic', map };
    }
  }
}

/** An empty student key of the right shape for a cipher type. */
export function emptyStudentKey(type: CipherType): StudentKey {
  switch (type) {
    case 'caesar':
      return { type, shift: null };
    case 'affine':
      return { type, a: null, b: null };
    case 'substitution':
    case 'homophonic':
      return { type, map: {} };
    case 'vigenere':
      return { type, keyword: '' };
    case 'columnar':
      return { type, order: [] };
  }
}

/**
 * Decrypts with whatever the student has so far. Output is a letter string
 * (for homophonic input, one letter per symbol) with `_` where the key does
 * not yet determine the plaintext.
 */
export function partialDecrypt(cipher: string, key: StudentKey): string {
  const c = key.type === 'homophonic' ? '' : onlyLetters(cipher);
  switch (key.type) {
    case 'caesar':
      if (key.shift === null) return UNKNOWN.repeat(c.length);
      return c.replace(/[A-Z]/g, (ch) => indexLetter(letterIndex(ch) - key.shift!));
    case 'affine': {
      if (key.a === null || key.b === null) return UNKNOWN.repeat(c.length);
      const inv = modInverse26(key.a);
      if (inv < 0) return UNKNOWN.repeat(c.length);
      return c.replace(/[A-Z]/g, (ch) => indexLetter(inv * (letterIndex(ch) - key.b!)));
    }
    case 'substitution':
      return c.replace(/[A-Z]/g, (ch) => key.map[ch] ?? UNKNOWN);
    case 'vigenere': {
      const k = onlyLettersOrQuery(key.keyword);
      if (k.length === 0) return UNKNOWN.repeat(c.length);
      return c
        .split('')
        .map((ch, i) => {
          const kc = k[i % k.length];
          return kc === '?' ? UNKNOWN : indexLetter(letterIndex(ch) - letterIndex(kc));
        })
        .join('');
    }
    case 'columnar':
      return columnarDecrypt(c, key.order);
    case 'homophonic':
      return homophonicSymbols(cipher)
        .map((s) => key.map[s] ?? UNKNOWN)
        .join('');
  }
}

/** Keeps letters and `?` placeholders, upper-cased. */
export function onlyLettersOrQuery(s: string): string {
  return s.toUpperCase().replace(/[^A-Z?]/g, '');
}

/** True when the student key fully determines a decryption (no `_` output). */
export function isComplete(key: StudentKey): boolean {
  switch (key.type) {
    case 'caesar':
      return key.shift !== null;
    case 'affine':
      return key.a !== null && key.b !== null && modInverse26(key.a) > 0;
    case 'substitution':
      return Object.keys(key.map).length === 26;
    case 'vigenere':
      return key.keyword.length > 0 && !key.keyword.includes('?');
    case 'columnar':
      return key.order.length > 0 && key.order.every((x) => x !== null);
    case 'homophonic':
      return Object.keys(key.map).length > 0;
  }
}

// ---------------------------------------------------------- key generation

const KEYWORDS = [
  'LEMON', 'CIPHER', 'ORANGE', 'PYTHON', 'SECRET', 'MATRIX', 'FALCON', 'GARDEN', 'SILVER',
  'THUNDER', 'PLANET', 'WIZARD', 'BRIDGE', 'CASTLE', 'ROCKET', 'VIOLET', 'JUNGLE', 'HARBOR',
];

/** A random key of the given type, reproducible from the rng. */
export function randomKey(type: CipherType, rng: Rng): Key {
  switch (type) {
    case 'caesar':
      return { type, shift: 1 + rng.int(25) };
    case 'affine':
      return { type, a: rng.pick(AFFINE_MULTIPLIERS.filter((m) => m !== 1)), b: rng.int(26) };
    case 'substitution': {
      // Reject the rare shuffle that leaves a letter mapped to itself so every
      // rung is a genuine 26-letter puzzle.
      let alphabet: string;
      do alphabet = rng.shuffle(ALPHABET.split('')).join('');
      while (alphabet.split('').some((ch, i) => ch === ALPHABET[i]));
      return { type, alphabet };
    }
    case 'vigenere':
      return { type, keyword: rng.pick(KEYWORDS) };
    case 'columnar':
      return { type, keyword: rng.pick(KEYWORDS) };
    case 'homophonic':
      return { type, table: makeHomophonicTable(rng) };
  }
}

/** Parses a key typed by an instructor for a rung; returns null when it is unusable. */
export function parseKey(type: CipherType, raw: string, rng: Rng): Key | null {
  const s = raw.trim();
  if (s === '') return randomKey(type, rng);
  switch (type) {
    case 'caesar': {
      const n = Number(s);
      return Number.isInteger(n) && n > 0 && n < 26 ? { type, shift: n } : null;
    }
    case 'affine': {
      const m = s.match(/^(\d+)\D+(\d+)$/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      return AFFINE_MULTIPLIERS.includes(a) && b >= 0 && b < 26 ? { type, a, b } : null;
    }
    case 'substitution': {
      const alphabet = onlyLetters(s);
      return alphabet.length === 26 && new Set(alphabet).size === 26 ? { type, alphabet } : null;
    }
    case 'vigenere':
    case 'columnar': {
      const keyword = onlyLetters(s);
      return keyword.length >= 2 ? { type, keyword } : null;
    }
    case 'homophonic':
      // Homophonic tables are always generated; the field only carries a seed.
      return randomKey(type, rng);
  }
}

/** A short human-readable form of a key, for the debrief and the solution. */
export function describeKey(key: Key): string {
  switch (key.type) {
    case 'caesar':
      return `shift ${key.shift}`;
    case 'affine':
      return `a = ${key.a}, b = ${key.b}`;
    case 'substitution':
      return `plain ${ALPHABET} -> cipher ${key.alphabet}`;
    case 'vigenere':
    case 'columnar':
      return `keyword ${onlyLetters(key.keyword)}`;
    case 'homophonic':
      return Object.entries(key.table)
        .map(([l, syms]) => `${l}: ${syms.join(' ')}`)
        .join('; ');
  }
}
