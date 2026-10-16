/** Statistics for the live chart and the post-game breakdown. */

import type { Bit } from './predictor';

export const Z95 = 1.959963984540054;

/** Wilson score interval for k successes out of n. */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Where a fair coin's hit rate lands 95% of the time after n guesses (normal approximation). */
export function coinBand(n: number, z = Z95): [number, number] {
  if (n === 0) return [0, 1];
  const half = z * Math.sqrt(0.25 / n);
  return [Math.max(0, 0.5 - half), Math.min(1, 0.5 + half)];
}

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** One-sided P(X >= k) for X ~ Binomial(n, 1/2): how lucky a coin-flipping oracle would have to be. */
export function binomialTail(k: number, n: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const logHalfN = n * Math.log(0.5);
  let total = 0;
  for (let i = k; i <= n; i++) total += Math.exp(logChoose(n, i) + logHalfN);
  return Math.min(1, total);
}

/** Running hit rate after each guess. */
export function runningAccuracy(correct: readonly boolean[]): number[] {
  let hits = 0;
  return correct.map((c, i) => {
    if (c) hits++;
    return hits / (i + 1);
  });
}

/** Hit rate over the last `window` guesses at each point (shorter at the start). */
export function rollingAccuracy(correct: readonly boolean[], window: number): number[] {
  let hits = 0;
  return correct.map((c, i) => {
    if (c) hits++;
    if (i >= window && correct[i - window]) hits--;
    return hits / Math.min(i + 1, window);
  });
}

export function runLengths(seq: readonly Bit[]): number[] {
  const runs: number[] = [];
  let len = 0;
  seq.forEach((b, i) => {
    if (i > 0 && b !== seq[i - 1]) {
      runs.push(len);
      len = 0;
    }
    len++;
  });
  if (len > 0) runs.push(len);
  return runs;
}

/** Fraction of presses (after the first) that differ from the previous one. A coin gives 0.5. */
export function alternationRate(seq: readonly Bit[]): number {
  if (seq.length < 2) return 0;
  let switches = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) switches++;
  return switches / (seq.length - 1);
}

/** Longest run a fair coin would usually produce in n flips: about log2(n). */
export function expectedLongestRun(n: number): number {
  return n <= 0 ? 0 : Math.log2(n);
}

export interface RunHistogramRow {
  length: number;
  observed: number;
  /** Expected number of runs of exactly this length for a fair coin with the same number of runs. */
  expected: number;
}

export function runHistogram(seq: readonly Bit[], maxLength = 8): RunHistogramRow[] {
  const runs = runLengths(seq);
  const rows: RunHistogramRow[] = [];
  for (let length = 1; length <= maxLength; length++) {
    const last = length === maxLength;
    const observed = runs.filter((r) => (last ? r >= length : r === length)).length;
    // For a fair coin run lengths are geometric: P(L = l) = 2^-l, P(L >= l) = 2^-(l-1).
    const p = last ? 2 ** -(length - 1) : 2 ** -length;
    rows.push({ length, observed, expected: runs.length * p });
  }
  return rows;
}

/**
 * Adaptive code length in bits per press under an order-k Krichevsky-Trofimov
 * model: each press is coded with probability (count + 1/2) / (total + 1) of
 * what followed the same k-press context so far. It is a real compressor, so
 * it can only overestimate the source's entropy (up to learning cost), and a
 * value below 1 means the sequence really is compressible.
 */
export function ktBitsPerPress(seq: readonly Bit[], order: number): number {
  if (seq.length === 0) return 1;
  const counts = new Map<string, [number, number]>();
  let bits = 0;
  seq.forEach((b, i) => {
    const key = `${Math.min(i, order)}:${seq.slice(Math.max(0, i - order), i).join('')}`;
    const c = counts.get(key) ?? [0, 0];
    bits -= Math.log2((c[b] + 0.5) / (c[0] + c[1] + 1));
    c[b]++;
    counts.set(key, c);
  });
  return bits / seq.length;
}

export interface EntropyEstimate {
  byOrder: { order: number; bitsPerPress: number }[];
  best: { order: number; bitsPerPress: number };
}

/** KT code length for context orders 0..maxOrder, and the best (lowest) of them. */
export function entropyEstimate(seq: readonly Bit[], maxOrder = 5): EntropyEstimate {
  const byOrder = [];
  for (let order = 0; order <= maxOrder; order++) byOrder.push({ order, bitsPerPress: ktBitsPerPress(seq, order) });
  const best = byOrder.reduce((a, b) => (b.bitsPerPress < a.bitsPerPress ? b : a));
  return { byOrder, best };
}

export interface NGramRow {
  context: string;
  f: number;
  j: number;
}

/** What followed each length-k context in the sequence, most frequent contexts first. Contexts use F/J letters. */
export function ngramTable(seq: readonly Bit[], k: number): NGramRow[] {
  const rows = new Map<string, NGramRow>();
  for (let i = k; i < seq.length; i++) {
    const context = seq
      .slice(i - k, i)
      .map((b) => (b === 0 ? 'F' : 'J'))
      .join('');
    const row = rows.get(context) ?? { context, f: 0, j: 0 };
    if (seq[i] === 0) row.f++;
    else row.j++;
    rows.set(context, row);
  }
  return [...rows.values()].sort((a, b) => b.f + b.j - (a.f + a.j) || a.context.localeCompare(b.context));
}

/** How many presses a table-driven oracle would have got right by always taking each row's majority. */
export function tableHits(rows: readonly NGramRow[]): number {
  return rows.reduce((s, r) => s + Math.max(r.f, r.j), 0);
}

export interface Summary {
  presses: number;
  hits: number;
  accuracy: number;
  ci: [number, number];
  pValue: number;
  fShare: number;
  alternation: number;
  longestRun: number;
  expectedLongestRun: number;
  entropy: EntropyEstimate;
}

export function summarize(seq: readonly Bit[], correct: readonly boolean[]): Summary {
  const hits = correct.filter(Boolean).length;
  const n = correct.length;
  const runs = runLengths(seq);
  return {
    presses: seq.length,
    hits,
    accuracy: n === 0 ? 0 : hits / n,
    ci: wilson(hits, n),
    pValue: binomialTail(hits, n),
    fShare: seq.length === 0 ? 0 : seq.filter((b) => b === 0).length / seq.length,
    alternation: alternationRate(seq),
    longestRun: runs.length === 0 ? 0 : Math.max(...runs),
    expectedLongestRun: expectedLongestRun(seq.length),
    entropy: entropyEstimate(seq),
  };
}
