import { describe, expect, it } from 'vitest';
import {
  bestApproximations,
  continuedFraction,
  convergents,
  formatRuns,
  gcd,
  reduce,
  relError,
  sternBrocotRuns,
} from '../src/core/fractions';

describe('basics', () => {
  it('gcd and reduce', () => {
    expect(gcd(1440, 96)).toBe(96);
    expect(gcd(-12, 18)).toBe(6);
    expect(reduce(768, 64)).toEqual({ p: 12, q: 1 });
    expect(reduce(0, 0)).toEqual({ p: 0, q: 0 });
  });

  it('relError is signed', () => {
    expect(relError({ p: 22, q: 7 }, Math.PI)).toBeGreaterThan(0);
    expect(relError({ p: 3, q: 1 }, Math.PI)).toBeLessThan(0);
  });
});

describe('continued fractions', () => {
  it('expands pi and rationals', () => {
    expect(continuedFraction(Math.PI, 5)).toEqual([3, 7, 15, 1, 292]);
    expect(continuedFraction(355 / 113)).toEqual([3, 7, 16]);
    expect(continuedFraction(12)).toEqual([12]);
    expect(continuedFraction(0.75)).toEqual([0, 1, 3]);
  });

  it('stops before denominators get too large', () => {
    const t = continuedFraction(Math.PI, 30, 1000);
    expect(convergents(t).at(-1)).toEqual({ p: 355, q: 113 });
  });

  it('rejects non-positive targets', () => {
    expect(() => continuedFraction(0)).toThrow('positive');
  });

  it('convergents of pi', () => {
    expect(convergents([3, 7, 15, 1])).toEqual([
      { p: 3, q: 1 },
      { p: 22, q: 7 },
      { p: 333, q: 106 },
      { p: 355, q: 113 },
    ]);
  });
});

describe('Stern-Brocot path', () => {
  it('run-length encodes the walk, one run per term', () => {
    // 3/2 = [1; 2]: from 1/1 go R to 2/1, then L to 3/2.
    expect(sternBrocotRuns([1, 2])).toEqual([
      { dir: 'R', count: 1 },
      { dir: 'L', count: 1 },
    ]);
    expect(sternBrocotRuns(continuedFraction(1440))).toEqual([{ dir: 'R', count: 1439 }]);
    expect(sternBrocotRuns([0, 1, 3])).toEqual([
      { dir: 'L', count: 1 },
      { dir: 'R', count: 2 },
    ]);
    expect(sternBrocotRuns([1])).toEqual([]);
  });

  it('formats runs with superscripts and truncates', () => {
    expect(formatRuns([])).toBe('(root: 1/1)');
    expect(formatRuns([{ dir: 'R', count: 1439 }, { dir: 'L', count: 1 }])).toBe('R¹⁴³⁹ L');
    const many = Array.from({ length: 5 }, (_, i) => ({ dir: (i % 2 ? 'L' : 'R') as 'L' | 'R', count: 2 }));
    expect(formatRuns(many, 3)).toBe('R² L² R² …');
  });
});

describe('best approximations', () => {
  it('lists every record-setting fraction up to maxDen', () => {
    const a = bestApproximations(Math.PI, 120);
    expect(a.map((r) => `${r.p}/${r.q}`)).toEqual(['3/1', '13/4', '16/5', '19/6', '22/7', '179/57', '201/64', '223/71', '245/78', '267/85', '289/92', '311/99', '333/106', '355/113']);
    expect(a.find((r) => r.q === 7)?.kind).toBe('convergent');
    expect(a.find((r) => r.q === 4)?.kind).toBe('semiconvergent');
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i]!.error)).toBeLessThan(Math.abs(a[i - 1]!.error));
  });

  it('limits to the last entries', () => {
    expect(bestApproximations(Math.PI, 120, 2).map((r) => r.q)).toEqual([106, 113]);
  });

  it('handles targets below one', () => {
    const a = bestApproximations(365.2422 / 366.2422, 400);
    expect(a.at(-1)).toMatchObject({ p: 365, q: 366 });
  });
});
