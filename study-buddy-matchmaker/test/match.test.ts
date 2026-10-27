import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, gradebookFromCsv, profiles, topicsOf, type Profile } from '../src/core/gradebook';
import {
  exactMatching,
  helpBetween,
  localMatching,
  makeGroups,
  matchingWeight,
  pairScore,
  randomBaseline,
  weights,
  type MatchOptions,
} from '../src/core/match';
import { sampleCsv } from '../src/core/sample';

const opts: MatchOptions = { thresholds: DEFAULT_THRESHOLDS };

/** Profiles straight from a mastery table: rows of numbers (or null) per topic. */
function fake(rows: (number | null)[][], topics = rows[0]?.map((_, k) => `t${k}`) ?? []): { ps: Profile[]; topics: string[] } {
  const ps = rows.map((r, i) => ({
    student: { id: `s${i}`, name: `S${i}`, scores: [] },
    mastery: new Map(topics.map((t, k) => [t, r[k] ?? null])),
  }));
  return { ps, topics };
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

function bruteBest(w: number[][]): number {
  const n = w.length;
  const go = (left: number[]): number => {
    if (!left.length) return 0;
    const [i, ...rest] = left as [number, ...number[]];
    let b = -Infinity;
    rest.forEach((j, k) => {
      b = Math.max(b, (w[i] as number[])[j] as number + go(rest.filter((_, x) => x !== k)));
    });
    return b;
  };
  return go([...Array(n).keys()]);
}

describe('pair scores', () => {
  it('counts help both ways and rewards reciprocity', () => {
    const { ps, topics } = fake([
      [0.9, 0.4],
      [0.3, 0.95],
      [0.9, 0.9],
    ]);
    const mutual = pairScore(ps, 0, 1, topics, opts);
    expect(mutual.help).toEqual([
      { topic: 't0', teacher: 0, learner: 1, gain: expect.closeTo(0.6) },
      { topic: 't1', teacher: 1, learner: 0, gain: expect.closeTo(0.55) },
    ]);
    expect(mutual.score).toBeCloseTo(0.6 + 0.55 + 0.55);
    // Student 2 can teach student 1 more on t0, but nothing flows back.
    expect(pairScore(ps, 1, 2, topics, opts).score).toBeCloseTo(0.6);
  });

  it('penalises shared gaps and skips topics either student lacks data on', () => {
    const { ps, topics } = fake([
      [0.2, null, 0.9],
      [0.3, 0.9, 0.5],
    ]);
    const s = pairScore(ps, 0, 1, topics, opts);
    expect(s.sharedGaps).toEqual(['t0']);
    expect(s.help).toHaveLength(1);
    expect(s.score).toBeCloseTo(0.4 - 0.15);
    expect(helpBetween(ps, 1, 0, topics, DEFAULT_THRESHOLDS)[0]).toMatchObject({ teacher: 0, learner: 1 });
  });
});

describe('matching', () => {
  it('exact matching equals brute force on random graphs', () => {
    const r = rng(7);
    for (let trial = 0; trial < 30; trial++) {
      const n = 2 * (1 + Math.floor(r() * 4));
      const w = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) (w[i] as number[])[j] = (w[j] as number[])[i] = Math.round(r() * 100) / 10 - 2;
      const pairs = exactMatching(w);
      expect(new Set(pairs.flat()).size).toBe(n);
      expect(matchingWeight(w, pairs)).toBeCloseTo(bruteBest(w));
    }
    expect(exactMatching([])).toEqual([]);
    expect(() => exactMatching([[0]])).toThrow(/even/);
    expect(() => localMatching([[0]])).toThrow(/even/);
  });

  it('local search comes close to the optimum on 20-student classes', () => {
    const r = rng(11);
    let ratio = 0;
    const trials = 6;
    for (let t = 0; t < trials; t++) {
      const rows = Array.from({ length: 20 }, () => Array.from({ length: 6 }, () => r()));
      const { ps, topics } = fake(rows);
      const w = weights(ps, topics, opts);
      const best = matchingWeight(w, exactMatching(w));
      const local = localMatching(w);
      expect(new Set(local.flat()).size).toBe(20);
      ratio += matchingWeight(w, local) / best;
    }
    expect(ratio / trials).toBeGreaterThan(0.97);
  });

  it('beats random pairing on the sample class, with one trio for 23 students', () => {
    const { book } = gradebookFromCsv(sampleCsv());
    const ps = profiles(book);
    const topics = topicsOf(book);
    const { groups, exact } = makeGroups(ps, topics, opts);
    expect(exact).toBe(false);
    expect(groups.map((g) => g.members.length).sort()).toEqual([...Array(10).fill(2), 3]);
    expect(new Set(groups.flatMap((g) => g.members)).size).toBe(23);
    const total = groups.reduce((s, g) => s + g.score, 0);
    expect(total).toBeGreaterThan(1.5 * randomBaseline(ps, topics, opts));
  });

  it('is exact for small classes and keeps apart students apart', () => {
    const { ps, topics } = fake([
      [0.95, 0.3],
      [0.3, 0.95],
      [0.9, 0.35],
      [0.35, 0.9],
      [0.5, 0.5],
    ]);
    const free = makeGroups(ps, topics, opts);
    expect(free.exact).toBe(true);
    const together = (g: number[][], a: number, b: number) => g.some((m) => m.includes(a) && m.includes(b));
    const apart = makeGroups(ps, topics, { ...opts, apart: [[1, 0], [0, 3], [2, 1], [2, 3]] });
    const gs = apart.groups.map((g) => g.members);
    expect(together(gs, 0, 1) || together(gs, 0, 3) || together(gs, 1, 2) || together(gs, 2, 3)).toBe(false);
    expect(together(free.groups.map((g) => g.members), 0, 1) || together(free.groups.map((g) => g.members), 0, 3)).toBe(true);
  });

  it('handles empty and single-student classes', () => {
    expect(makeGroups([], [], opts).groups).toEqual([]);
    const one = fake([[0.5]]);
    expect(makeGroups(one.ps, one.topics, opts).groups).toEqual([{ members: [0], score: 0, help: [], sharedGaps: [] }]);
    expect(randomBaseline(one.ps, one.topics, opts)).toBe(0);
  });

  it('flags topics no group member is strong in', () => {
    const { ps, topics } = fake([
      [0.2, 0.9],
      [0.4, 0.3],
    ]);
    expect(makeGroups(ps, topics, opts).groups[0]?.sharedGaps).toEqual(['t0']);
  });

  it('uses local search above the exact limit', () => {
    const { ps, topics } = fake([[0.9], [0.1], [0.85], [0.2]]);
    const g = makeGroups(ps, topics, { ...opts, exactLimit: 2 });
    expect(g.exact).toBe(false);
    expect(g.groups).toHaveLength(2);
  });
});
