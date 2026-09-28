/**
 * The workbench tools: letter and bigram frequencies, index of coincidence
 * per candidate period, and the Kasiski repeat examination.
 */
import { homophonicSymbols } from './ciphers.js';
import { ALPHABET, ENGLISH_FREQ, indexOfCoincidence, letterCounts, onlyLetters } from './text.js';

export interface FrequencyRow {
  letter: string;
  count: number;
  /** Percent of the text. */
  pct: number;
  /** English baseline percent for the same letter. */
  english: number;
}

/** Letter frequency table, one row per letter A-Z in alphabetical order. */
export function letterFrequencies(text: string): FrequencyRow[] {
  const counts = letterCounts(text);
  const n = counts.reduce((a, b) => a + b, 0) || 1;
  return ALPHABET.split('').map((letter, i) => ({
    letter,
    count: counts[i],
    pct: (100 * counts[i]) / n,
    english: ENGLISH_FREQ[letter],
  }));
}

/** Cipher letters sorted from most to least frequent (ties alphabetical). */
export function frequencyOrder(text: string): string[] {
  return letterFrequencies(text)
    .sort((a, b) => b.count - a.count || (a.letter < b.letter ? -1 : 1))
    .map((r) => r.letter);
}

/** English letters from most to least frequent. */
export const ENGLISH_ORDER = ALPHABET.split('').sort((a, b) => ENGLISH_FREQ[b] - ENGLISH_FREQ[a]);

export interface NgramRow {
  gram: string;
  count: number;
}

/** The `limit` most common overlapping n-grams of the text. */
export function topNgrams(text: string, n: number, limit = 12): NgramRow[] {
  const t = onlyLetters(text);
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([gram, count]) => ({ gram, count }))
    .sort((a, b) => b.count - a.count || (a.gram < b.gram ? -1 : 1))
    .slice(0, limit);
}

/** Most common English bigrams, for the workbench baseline column. */
export const ENGLISH_BIGRAMS = ['TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND', 'TI', 'ES'];

/** Symbol frequencies of a homophonic ciphertext, most common first. */
export function symbolFrequencies(cipher: string): NgramRow[] {
  const counts = new Map<string, number>();
  for (const s of homophonicSymbols(cipher)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([gram, count]) => ({ gram, count }))
    .sort((a, b) => b.count - a.count || (a.gram < b.gram ? -1 : 1));
}

/** Every `period`-th letter starting at `offset`. */
export function column(text: string, period: number, offset: number): string {
  const t = onlyLetters(text);
  let out = '';
  for (let i = offset; i < t.length; i += period) out += t[i];
  return out;
}

export interface PeriodRow {
  period: number;
  /** Mean index of coincidence over the period's columns. */
  ic: number;
}

/**
 * Average index of coincidence of the columns for each candidate key length.
 * For a Vigenere ciphertext the true period (and its multiples) jump toward
 * English's 0.067 while the others stay near random's 0.038.
 */
export function icByPeriod(text: string, maxPeriod = 12): PeriodRow[] {
  const rows: PeriodRow[] = [];
  for (let p = 1; p <= maxPeriod; p++) {
    let sum = 0;
    for (let o = 0; o < p; o++) sum += indexOfCoincidence(column(text, p, o));
    rows.push({ period: p, ic: sum / p });
  }
  return rows;
}

export interface KasiskiRepeat {
  gram: string;
  positions: number[];
  /** Distances between consecutive occurrences. */
  distances: number[];
}

export interface KasiskiResult {
  repeats: KasiskiRepeat[];
  /** How many repeat distances each candidate period divides. */
  factorCounts: { period: number; count: number }[];
}

/**
 * Kasiski examination: find repeated trigrams (or longer), record the
 * distances between their occurrences, and count which small periods divide
 * those distances. The key length is usually the largest period that divides
 * most of them.
 */
export function kasiski(text: string, gramLength = 3, maxPeriod = 12): KasiskiResult {
  const t = onlyLetters(text);
  const seen = new Map<string, number[]>();
  for (let i = 0; i + gramLength <= t.length; i++) {
    const g = t.slice(i, i + gramLength);
    const list = seen.get(g);
    if (list) list.push(i);
    else seen.set(g, [i]);
  }
  const repeats: KasiskiRepeat[] = [];
  for (const [gram, positions] of seen) {
    if (positions.length < 2) continue;
    const distances = positions.slice(1).map((p, i) => p - positions[i]);
    repeats.push({ gram, positions, distances });
  }
  repeats.sort((a, b) => b.positions.length - a.positions.length || (a.gram < b.gram ? -1 : 1));
  const factorCounts = [];
  for (let p = 2; p <= maxPeriod; p++) {
    let count = 0;
    for (const r of repeats) for (const d of r.distances) if (d % p === 0) count++;
    factorCounts.push({ period: p, count });
  }
  return { repeats, factorCounts };
}
