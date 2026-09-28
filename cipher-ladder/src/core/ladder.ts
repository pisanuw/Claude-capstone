/**
 * A ladder is an ordered list of rungs an instructor configures. A rung
 * definition is small (cipher type, optional key, optional plaintext, hint
 * budget); `materialize` turns it into a concrete puzzle with a key, a
 * plaintext and a ciphertext, reproducibly from the ladder's seed, so a
 * shared link always yields the same puzzles.
 */
import {
  CIPHER_LABEL,
  describeKey,
  emptyStudentKey,
  encrypt,
  fullStudentKey,
  keywordOrder,
  onlyLettersOrQuery,
  parseKey,
  partialDecrypt,
  randomKey,
  type CipherType,
  type Key,
  type StudentKey,
} from './ciphers.js';
import { frequencyOrder, symbolFrequencies } from './analysis.js';
import { PASSAGES } from './corpus.js';
import { makeRng } from './rng.js';
import { group5, onlyLetters, reflow } from './text.js';

export interface RungDef {
  cipher: CipherType;
  /** Free-form title shown in the ladder; defaults to the cipher name. */
  title?: string;
  /** Instructor-typed key; empty or absent means generate one from the seed. */
  key?: string;
  /** Instructor-supplied plaintext; empty or absent means a bundled passage. */
  plaintext?: string;
  /** How many hints the student may take on this rung. */
  hints: number;
  /** Optional teaching note shown above the workbench. */
  note?: string;
}

export interface LadderDef {
  title: string;
  seed: string;
  rungs: RungDef[];
}

export interface Rung {
  index: number;
  def: RungDef;
  title: string;
  key: Key;
  /** Plaintext letters only, upper case: what the student must reproduce. */
  plainLetters: string;
  /** The plaintext as written, for the solved view and the debrief. */
  plaintext: string;
  /** Where the plaintext came from, for the solved view. */
  source: string;
  /** Ciphertext as shown: five-letter groups, or space-separated symbols. */
  ciphertext: string;
}

export const DEFAULT_LADDER: LadderDef = {
  title: 'Classical cryptanalysis, six rungs',
  seed: 'cipher-ladder-2026',
  rungs: [
    { cipher: 'caesar', hints: 1, note: 'Every letter is shifted by the same amount. The frequency chart is all you need: find the tall bar that must be E.' },
    { cipher: 'affine', hints: 2, note: 'Each letter x becomes a*x + b mod 26. Two confident letter identifications give two equations; or lean on the frequency chart and test.' },
    { cipher: 'vigenere', hints: 2, note: 'A repeating keyword shifts each letter differently. Find the key length with the period tools, then treat each column as its own Caesar cipher.' },
    { cipher: 'columnar', hints: 2, note: 'The letters are not replaced, only reordered: the plaintext was written into rows and read out by columns in keyword order. Guess the column count, then the order.' },
    { cipher: 'substitution', hints: 4, note: 'Any letter can stand for any other. Start with the frequency and bigram charts, pin the obvious ones (E, T, TH, HE), and let the words that appear suggest the rest.' },
    { cipher: 'homophonic', hints: 6, note: 'Common letters have several symbols each, so the histogram is nearly flat. Look for symbols that repeat in the same contexts, and use the sentence fragments that emerge.' },
  ],
};

export const MAX_HINTS = 12;

/** Cleans a ladder read from a link or a form, dropping anything malformed. */
export function normalizeLadder(input: unknown): LadderDef | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.rungs) || obj.rungs.length === 0) return null;
  const rungs: RungDef[] = [];
  for (const r of obj.rungs as unknown[]) {
    if (!r || typeof r !== 'object') return null;
    const d = r as Record<string, unknown>;
    if (typeof d.cipher !== 'string' || !(d.cipher in CIPHER_LABEL)) return null;
    const hints = Number(d.hints);
    const rung: RungDef = {
      cipher: d.cipher as CipherType,
      hints: Number.isFinite(hints) ? Math.min(MAX_HINTS, Math.max(0, Math.floor(hints))) : 0,
    };
    if (typeof d.title === 'string' && d.title.trim()) rung.title = d.title.trim().slice(0, 80);
    if (typeof d.key === 'string' && d.key.trim()) rung.key = d.key.trim().slice(0, 200);
    if (typeof d.plaintext === 'string' && onlyLetters(d.plaintext).length >= 20) rung.plaintext = d.plaintext.trim().slice(0, 4000);
    if (typeof d.note === 'string' && d.note.trim()) rung.note = d.note.trim().slice(0, 400);
    rungs.push(rung);
  }
  return {
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 120) : 'Untitled ladder',
    seed: typeof obj.seed === 'string' && obj.seed ? obj.seed.slice(0, 64) : 'seed',
    rungs: rungs.slice(0, 20),
  };
}

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Serializes a ladder into a URL fragment (`#l=...`). */
export function encodeLadder(ladder: LadderDef): string {
  return 'l=' + base64UrlEncode(JSON.stringify(ladder));
}

/** Reads a ladder back from a URL fragment; null if absent or malformed. */
export function decodeLadder(hash: string): LadderDef | null {
  const m = hash.replace(/^#/, '').match(/(?:^|&)l=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    return normalizeLadder(JSON.parse(base64UrlDecode(m[1])));
  } catch {
    return null;
  }
}

/** A stable id for a ladder, used to key saved progress. */
export function ladderId(ladder: LadderDef): string {
  return makeRng(JSON.stringify(ladder)).int(1e9).toString(36);
}

/** Builds the concrete puzzle for rung `index` of the ladder. */
export function materialize(ladder: LadderDef, index: number): Rung {
  const def = ladder.rungs[index];
  const rng = makeRng(`${ladder.seed}/${index}/${def.cipher}`);
  const key = (def.key ? parseKey(def.cipher, def.key, rng) : null) ?? randomKey(def.cipher, rng);
  let plaintext: string;
  let source: string;
  if (def.plaintext) {
    plaintext = def.plaintext;
    source = 'Instructor-supplied text';
  } else {
    const passage = rng.pick(PASSAGES);
    plaintext = passage.text;
    source = `${passage.title} (${passage.source})`;
  }
  let plainLetters = onlyLetters(plaintext);
  if (def.cipher === 'columnar') {
    // Keep a whole number of rows so every column has the same length; the
    // read order is then the only unknown, which is what the rung teaches.
    const cols = keywordOrder((key as { keyword: string }).keyword).length;
    const rows = Math.floor(plainLetters.length / cols);
    plainLetters = plainLetters.slice(0, rows * cols);
    plaintext = reflow(plainLetters, plaintext);
  }
  const raw = encrypt(plainLetters, key, rng);
  const ciphertext = def.cipher === 'homophonic' ? raw : group5(raw);
  return {
    index,
    def,
    title: def.title ?? `${index + 1}. ${CIPHER_LABEL[def.cipher]}`,
    key,
    plainLetters,
    plaintext,
    source,
    ciphertext,
  };
}

/** True when the student's key decrypts the rung exactly. */
export function isSolved(rung: Rung, key: StudentKey): boolean {
  return partialDecrypt(rung.ciphertext, key) === rung.plainLetters;
}

/** Fraction of plaintext letters the student's current key gets right. */
export function progressFraction(rung: Rung, key: StudentKey): number {
  const guess = partialDecrypt(rung.ciphertext, key);
  const n = rung.plainLetters.length;
  if (n === 0 || guess.length !== n) return 0;
  let same = 0;
  for (let i = 0; i < n; i++) if (guess[i] === rung.plainLetters[i]) same++;
  return same / n;
}

export interface Hint {
  key: StudentKey;
  text: string;
}

/**
 * Reveals one more piece of the key on top of the student's current key.
 * Returns null when nothing is left to reveal.
 */
export function nextHint(rung: Rung, current: StudentKey): Hint | null {
  const full = fullStudentKey(rung.key);
  switch (full.type) {
    case 'caesar': {
      if (current.type === 'caesar' && current.shift === full.shift) return null;
      return { key: full, text: `The shift is ${full.shift}.` };
    }
    case 'affine': {
      const cur = current.type === 'affine' ? current : emptyStudentKey('affine');
      if (cur.type !== 'affine') return null;
      const b = full.b as number;
      const a = full.a as number;
      if (cur.b !== b) return { key: { type: 'affine', a: cur.a, b }, text: `b is ${b} (so plaintext A becomes ciphertext ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b]}).` };
      if (cur.a !== a) return { key: { type: 'affine', a, b }, text: `a is ${a}.` };
      return null;
    }
    case 'substitution': {
      const cur = current.type === 'substitution' ? current.map : {};
      // Reveal the most frequent cipher letter the student has not yet got right.
      for (const c of frequencyOrder(rung.ciphertext)) {
        if (cur[c] !== full.map[c]) {
          return { key: { type: 'substitution', map: { ...cur, [c]: full.map[c] } }, text: `Ciphertext ${c} is plaintext ${full.map[c]}.` };
        }
      }
      return null;
    }
    case 'vigenere': {
      const cur = onlyLettersOrQuery(current.type === 'vigenere' ? current.keyword : '');
      const L = full.keyword.length;
      if (cur.length !== L) return { key: { type: 'vigenere', keyword: '?'.repeat(L) }, text: `The keyword has ${L} letters.` };
      for (let i = 0; i < L; i++) {
        if (cur[i] !== full.keyword[i]) {
          const next = cur.slice(0, i) + full.keyword[i] + cur.slice(i + 1);
          return { key: { type: 'vigenere', keyword: next }, text: `Keyword letter ${i + 1} is ${full.keyword[i]}.` };
        }
      }
      return null;
    }
    case 'columnar': {
      const cur = current.type === 'columnar' ? current.order : [];
      const order = full.order as number[];
      const L = order.length;
      if (cur.length !== L) return { key: { type: 'columnar', order: new Array<number | null>(L).fill(null) }, text: `There are ${L} columns.` };
      for (let i = 0; i < L; i++) {
        if (cur[i] !== order[i]) {
          const next = cur.slice();
          next[i] = order[i];
          return { key: { type: 'columnar', order: next }, text: `The ${ordinal(i + 1)} chunk of ciphertext is column ${order[i] + 1}.` };
        }
      }
      return null;
    }
    case 'homophonic': {
      const cur = current.type === 'homophonic' ? current.map : {};
      for (const { gram } of symbolFrequencies(rung.ciphertext)) {
        if (cur[gram] !== full.map[gram]) {
          return { key: { type: 'homophonic', map: { ...cur, [gram]: full.map[gram] } }, text: `Symbol ${gram} is plaintext ${full.map[gram]}.` };
        }
      }
      return null;
    }
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** The solution shown after a solve: the full key in words plus the student-key form. */
export function solution(rung: Rung): { text: string; key: StudentKey } {
  return { text: describeKey(rung.key), key: fullStudentKey(rung.key) };
}
