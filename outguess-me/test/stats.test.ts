import { describe, expect, it } from 'vitest';
import type { Bit } from '../src/core/predictor';
import {
  alternationRate,
  binomialTail,
  coinBand,
  entropyEstimate,
  expectedLongestRun,
  ktBitsPerPress,
  ngramTable,
  rollingAccuracy,
  runHistogram,
  runLengths,
  runningAccuracy,
  summarize,
  tableHits,
  wilson,
} from '../src/core/stats';
import { prng } from './helpers';

const bits = (s: string): Bit[] => [...s].map((c) => (c === 'J' ? 1 : 0) as Bit);

describe('intervals and tails', () => {
  it('computes Wilson intervals', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [lo, hi] = wilson(65, 100);
    expect(lo).toBeCloseTo(0.5525, 3);
    expect(hi).toBeCloseTo(0.7364, 3);
    const [l0] = wilson(0, 10);
    expect(l0).toBe(0);
    const [, h1] = wilson(10, 10);
    expect(h1).toBeCloseTo(1, 12);
  });

  it('computes the coin band', () => {
    expect(coinBand(0)).toEqual([0, 1]);
    const [lo, hi] = coinBand(100);
    expect(lo).toBeCloseTo(0.402, 3);
    expect(hi).toBeCloseTo(0.598, 3);
    expect(coinBand(1)[0]).toBe(0);
  });

  it('computes the binomial upper tail at p = 1/2', () => {
    expect(binomialTail(0, 10)).toBe(1);
    expect(binomialTail(11, 10)).toBe(0);
    expect(binomialTail(10, 10)).toBeCloseTo(1 / 1024, 12);
    expect(binomialTail(5, 10)).toBeCloseTo(638 / 1024, 12);
    expect(binomialTail(60, 100)).toBeCloseTo(0.0284, 4);
  });
});

describe('accuracy series', () => {
  it('runs and rolls', () => {
    const c = [true, false, true, true];
    expect(runningAccuracy(c)).toEqual([1, 0.5, 2 / 3, 0.75]);
    expect(rollingAccuracy(c, 2)).toEqual([1, 0.5, 0.5, 1]);
  });
});

describe('runs and alternation', () => {
  it('finds runs', () => {
    expect(runLengths([])).toEqual([]);
    expect(runLengths(bits('FFJFFFJJ'))).toEqual([2, 1, 3, 2]);
  });

  it('measures alternation', () => {
    expect(alternationRate(bits('F'))).toBe(0);
    expect(alternationRate(bits('FJFJ'))).toBe(1);
    expect(alternationRate(bits('FFJJ'))).toBeCloseTo(1 / 3);
  });

  it('expects about log2(n) for the longest run', () => {
    expect(expectedLongestRun(0)).toBe(0);
    expect(expectedLongestRun(128)).toBe(7);
  });

  it('builds a run histogram with a final open bucket', () => {
    const rows = runHistogram(bits('FJJFFFFJ'), 3);
    expect(rows.map((r) => r.observed)).toEqual([2, 1, 1]);
    expect(rows.map((r) => r.expected)).toEqual([2, 1, 1]);
  });
});

describe('entropy', () => {
  it('returns 1 bit for an empty sequence', () => {
    expect(ktBitsPerPress([], 2)).toBe(1);
  });

  it('compresses an alternating sequence far below 1 bit', () => {
    const seq = bits('FJ'.repeat(100));
    const e = entropyEstimate(seq);
    expect(e.byOrder).toHaveLength(6);
    expect(e.best.order).toBeGreaterThan(0);
    expect(e.best.bitsPerPress).toBeLessThan(0.1);
    expect(e.byOrder[0]!.bitsPerPress).toBeGreaterThan(0.95);
  });

  it('does not compress fair coin flips', () => {
    const r = prng(42);
    const seq = Array.from({ length: 2000 }, () => (r() < 0.5 ? 0 : 1) as Bit);
    expect(entropyEstimate(seq).best.bitsPerPress).toBeGreaterThan(0.98);
  });
});

describe('n-gram table', () => {
  it('counts what follows each context, most common first', () => {
    const rows = ngramTable(bits('FJFJFF'), 1);
    expect(rows).toEqual([
      { context: 'F', f: 1, j: 2 },
      { context: 'J', f: 2, j: 0 },
    ]);
    expect(tableHits(rows)).toBe(4);
    expect(ngramTable(bits('FJ'), 2)).toEqual([]);
    const tied = ngramTable(bits('FJJF'), 1);
    expect(tied.map((r) => r.context)).toEqual(['J', 'F']);
  });
});

describe('summarize', () => {
  it('summarises a game', () => {
    const seq = bits('FJFJFJFJ');
    const s = summarize(seq, [true, true, false, true, true, true, true, true]);
    expect(s.presses).toBe(8);
    expect(s.hits).toBe(7);
    expect(s.accuracy).toBe(7 / 8);
    expect(s.pValue).toBeCloseTo(9 / 256, 12);
    expect(s.fShare).toBe(0.5);
    expect(s.alternation).toBe(1);
    expect(s.longestRun).toBe(1);
    expect(s.expectedLongestRun).toBe(3);
  });

  it('handles an empty game', () => {
    const s = summarize([], []);
    expect(s.accuracy).toBe(0);
    expect(s.fShare).toBe(0);
    expect(s.longestRun).toBe(0);
  });
});
