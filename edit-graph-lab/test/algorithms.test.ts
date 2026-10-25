import { describe, expect, it } from 'vitest';
import { diffArrays } from 'diff';
import { histogram, bestRun, MAX_CHAIN } from '../src/core/histogram';
import { lcs } from '../src/core/lcs';
import { myers, myersRegion } from '../src/core/myers';
import { longestIncreasing, patience, uniqueAnchors } from '../src/core/patience';
import { apply, distance, matches, pathOf, tokenize, type Script } from '../src/core/script';
import { rng } from '../src/core/exercises';

const chars = (s: string) => tokenize(s, 'char');

function randomPair(r: () => number, alphabet: string, maxLen: number): [string[], string[]] {
  const word = () => Array.from({ length: Math.floor(r() * (maxLen + 1)) }, () => alphabet[Math.floor(r() * alphabet.length)] as string);
  return [word(), word()];
}

function jsdiffDistance(a: string[], b: string[]): number {
  return diffArrays(a, b).reduce((n, c) => n + (c.added || c.removed ? (c.count as number) : 0), 0);
}

describe('Myers', () => {
  it('reproduces the paper example: D = 5 for ABCABBA -> CBABAC', () => {
    const res = myers(chars('ABCABBA'), chars('CBABAC'));
    expect(res.d).toBe(5);
    expect(res.steps).toHaveLength(6);
    // V after each step, as tabulated in the paper (forward greedy).
    expect(res.steps[0]?.v).toEqual([{ k: 0, x: 0 }]);
    expect(res.steps[1]?.v).toEqual([{ k: -1, x: 0 }, { k: 1, x: 1 }]);
    expect(res.steps[2]?.v).toEqual([{ k: -2, x: 2 }, { k: 0, x: 2 }, { k: 2, x: 3 }]);
    expect(res.steps[3]?.v).toEqual([{ k: -3, x: 3 }, { k: -1, x: 4 }, { k: 1, x: 5 }, { k: 3, x: 5 }]);
    expect(apply(res.script, chars('ABCABBA'), chars('CBABAC')).join('')).toBe('CBABAC');
  });

  it('builds a connected path of snakes from (0,0) to (N,M)', () => {
    const res = myers(chars('ABCABBA'), chars('CBABAC'));
    expect(res.path[0]?.from).toEqual({ x: 0, y: 0 });
    expect(res.path.at(-1)?.to).toEqual({ x: 7, y: 6 });
    for (let i = 1; i < res.path.length; i++) expect(res.path[i]?.from).toEqual(res.path[i - 1]?.to);
    res.path.forEach((s, i) => expect(s.d).toBe(i));
  });

  it('handles empty inputs and identical inputs', () => {
    expect(myers([], []).d).toBe(0);
    expect(myers([], ['x', 'y']).script).toEqual([{ type: 'ins', b: 0 }, { type: 'ins', b: 1 }]);
    expect(myers(['x'], []).script).toEqual([{ type: 'del', a: 0 }]);
    expect(myers(chars('same'), chars('same')).d).toBe(0);
  });

  it('works on a sub-region with absolute indices', () => {
    const a = chars('xxABCyy');
    const b = chars('zACz');
    const res = myersRegion(a, b, 2, 5, 1, 3);
    expect(res.d).toBe(1);
    expect(res.script).toEqual([{ type: 'eq', a: 2, b: 1 }, { type: 'del', a: 3 }, { type: 'eq', a: 4, b: 2 }]);
  });
});

describe('LCS dynamic programming', () => {
  it('fills the suffix table and backtracks', () => {
    const res = lcs(chars('ABCBDAB'), chars('BDCABA'));
    expect(res.length).toBe(4);
    expect(res.table).toHaveLength(8);
    expect(res.table[0]).toHaveLength(7);
    expect(matches(res.script)).toBe(4);
    expect(apply(res.script, chars('ABCBDAB'), chars('BDCABA')).join('')).toBe('BDCABA');
  });

  it('handles one-sided inputs', () => {
    expect(lcs([], chars('ab')).script.map((o) => o.type)).toEqual(['ins', 'ins']);
    expect(lcs(chars('ab'), []).script.map((o) => o.type)).toEqual(['del', 'del']);
  });
});

describe('patience helpers', () => {
  it('finds the longest increasing run by patience sorting', () => {
    const pairs: [number, number][] = [[0, 3], [1, 0], [2, 4], [3, 1], [4, 2], [5, 5]];
    expect(longestIncreasing(pairs)).toEqual([[1, 0], [3, 1], [4, 2], [5, 5]]);
    expect(longestIncreasing([])).toEqual([]);
  });

  it('only anchors on tokens unique to both sides', () => {
    const a = ['x', 'u', 'x', 'v', 'w'];
    const b = ['v', 'x', 'u', 'w', 'w'];
    // u and v are unique in both but cross, so only one survives; x repeats in A; w repeats in B.
    const anchors = uniqueAnchors(a, b, 0, a.length, 0, b.length);
    expect(anchors).toHaveLength(1);
    expect([[1, 2], [3, 0]]).toContainEqual(anchors[0]);
  });

  it('falls back to Myers when nothing is unique', () => {
    const a = chars('aabb');
    const b = chars('bbaa');
    expect(distance(patience(a, b))).toBe(distance(myers(a, b).script));
  });
});

describe('histogram helpers', () => {
  it('prefers the rarest common run', () => {
    const a = ['}', 'f', '}', 'g', '}'];
    const b = ['g', '}', 'f'];
    const run = bestRun(a, b, 0, a.length, 0, b.length);
    expect(run?.rarity).toBe(1);
    expect(run?.len).toBe(2);
  });

  it('ignores tokens that occur more than MAX_CHAIN times', () => {
    const a = new Array<string>(MAX_CHAIN + 1).fill('x');
    expect(bestRun(a, ['x'], 0, a.length, 0, 1)).toBeNull();
    expect(distance(histogram(a, ['x']))).toBe(MAX_CHAIN);
  });
});

describe('cross-checks on random inputs', () => {
  const algos: [string, (a: string[], b: string[]) => Script][] = [
    ['lcs', (a, b) => lcs(a, b).script],
    ['myers', (a, b) => myers(a, b).script],
    ['patience', patience],
    ['histogram', histogram],
  ];

  it('every script is a valid edit from A to B and the minimal ones agree with the diff package', () => {
    const r = rng(2026);
    for (let t = 0; t < 400; t++) {
      const [a, b] = randomPair(r, t % 2 ? 'ABC' : 'ABCDEFGH', 12);
      const min = jsdiffDistance(a, b);
      for (const [name, f] of algos) {
        const s = f(a, b);
        expect(apply(s, a, b), name).toEqual(b);
        expect(pathOf(s).at(-1)).toEqual({ x: a.length, y: b.length });
        if (name === 'lcs' || name === 'myers') expect(distance(s), `${name} ${a.join('')} ${b.join('')}`).toBe(min);
        else expect(distance(s)).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

describe('script utilities', () => {
  it('rejects inconsistent scripts', () => {
    expect(() => apply([{ type: 'eq', a: 0, b: 0 }], ['a'], ['b'])).toThrow(/bad match/);
    expect(() => apply([{ type: 'del', a: 1 }], ['a', 'b'], [])).toThrow(/bad delete/);
    expect(() => apply([{ type: 'ins', b: 1 }], [], ['a', 'b'])).toThrow(/bad insert/);
    expect(() => apply([], ['a'], [])).toThrow(/cover/);
  });

  it('tokenizes lines without a phantom final line', () => {
    expect(tokenize('a\nb\n', 'line')).toEqual(['a', 'b']);
    expect(tokenize('a\nb', 'line')).toEqual(['a', 'b']);
    expect(tokenize('', 'line')).toEqual([]);
    expect(tokenize('\n', 'line')).toEqual(['']);
    expect(tokenize('héllo', 'char')).toHaveLength(5);
  });
});
