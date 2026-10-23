import { describe, expect, it } from 'vitest';
import {
  buildableStages,
  factorInto,
  makeTrain,
  pairStages,
  productTable,
  searchTrains,
  validateLimits,
  type Limits,
} from '../src/core/search';

const L: Limits = { minTeeth: 8, maxTeeth: 120, maxStages: 3 };

describe('limits', () => {
  it('validates ranges', () => {
    expect(validateLimits(L)).toBeNull();
    expect(validateLimits({ ...L, minTeeth: 7.5 })).toMatch('whole numbers');
    expect(validateLimits({ ...L, minTeeth: 5 })).toMatch('at least 6');
    expect(validateLimits({ ...L, maxTeeth: 201 })).toMatch('at most 200');
    expect(validateLimits({ ...L, minTeeth: 50, maxTeeth: 40 })).toMatch('larger than');
    expect(validateLimits({ ...L, maxStages: 4 })).toMatch('between 1 and 3');
    expect(validateLimits({ ...L, maxStages: 0 })).toMatch('between 1 and 3');
  });
});

describe('product table and factoring', () => {
  it('marks products of exactly k tooth counts', () => {
    const small = { minTeeth: 8, maxTeeth: 20, maxStages: 2 };
    const t = productTable(small);
    expect(t).toBe(productTable(small)); // cached
    expect(t[13]! & 1).toBe(1);
    expect(t[21]! & 1).toBe(0);
    expect(t[64]! & 2).toBe(2); // 8 * 8
    expect(t[63]! & 2).toBe(0); // 7 * 9: 7 is out of range
    expect(t[17 * 19]! & 2).toBe(2);
  });

  it('finds the most even factorisation', () => {
    expect(factorInto(768, 2, 8, 120)).toEqual([24, 32]);
    expect(factorInto(6144, 3, 8, 120)).toEqual([16, 16, 24]);
    expect(factorInto(113, 1, 8, 120)).toEqual([113]);
    expect(factorInto(113, 2, 8, 120)).toBeNull();
    expect(factorInto(7, 1, 8, 120)).toBeNull();
  });

  it('pairs small with small', () => {
    expect(pairStages([10, 8], [96, 24])).toEqual([
      { driver: 8, driven: 24 },
      { driver: 10, driven: 96 },
    ]);
  });

  it('makeTrain computes ratio, error and teeth', () => {
    const t = makeTrain([{ driver: 8, driven: 96 }], 12);
    expect(t).toMatchObject({ num: 96, den: 8, ratio: 12, error: 0, teeth: 104 });
    expect(makeTrain([{ driver: 7, driven: 22 }], Math.PI).error).toBeCloseTo(22 / 7 / Math.PI - 1, 15);
  });
});

describe('searchTrains', () => {
  it('finds exact trains with the fewest stages and teeth first', () => {
    const r = searchTrains(12, L);
    expect(r.trains[0]).toMatchObject({ error: 0, stages: [{ driver: 8, driven: 96 }] });
    expect(r.bestByStages.map((t) => t?.stages.map((s) => `${s.driver}>${s.driven}`).join(','))).toEqual([
      '8>96',
      '8>24,8>32',
      '8>16,8>16,8>24',
    ]);
    expect(r.examined).toBeGreaterThan(0);
  });

  it('needs three stages for 1440 and reports none for fewer', () => {
    const r = searchTrains(1440, L);
    expect(r.bestByStages[0]).toBeNull();
    expect(r.bestByStages[1]).toBeNull();
    expect(r.bestByStages[2]?.ratio).toBe(1440);
  });

  it("approximates Brocot's sidereal ratio to a few ms/day in three stages", () => {
    const x = 365.2422 / 366.2422;
    const r = searchTrains(x, L);
    const errs = r.bestByStages.map((t) => Math.abs(t!.error));
    expect(errs[0]).toBeGreaterThan(errs[1]!);
    expect(errs[1]).toBeGreaterThan(errs[2]!);
    expect(errs[2]).toBeLessThan(1e-8);
    for (let i = 1; i < r.trains.length; i++)
      expect(Math.abs(r.trains[i]!.error)).toBeGreaterThanOrEqual(Math.abs(r.trains[i - 1]!.error));
    for (const t of r.trains) for (const s of t.stages) {
      expect(s.driver).toBeGreaterThanOrEqual(8);
      expect(s.driven).toBeLessThanOrEqual(120);
    }
  });

  it('finds 355/113 for pi in two stages', () => {
    const r = searchTrains(Math.PI, L);
    const t = r.bestByStages[1]!;
    expect((t.num / t.den) * 113).toBeCloseTo(355, 9);
  });

  it('keeps one train per reduced ratio and respects keep', () => {
    const r = searchTrains(2.75, { minTeeth: 11, maxTeeth: 53, maxStages: 1 }, 5);
    expect(r.trains).toHaveLength(5);
    expect(r.trains[0]!.stages).toEqual([{ driver: 12, driven: 33 }]);
    const keys = r.trains.map((t) => t.ratio);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing when nothing fits', () => {
    const r = searchTrains(1000, { minTeeth: 10, maxTeeth: 20, maxStages: 1 });
    expect(r.trains).toEqual([]);
    expect(r.bestByStages).toEqual([null]);
  });

  it('rejects bad input', () => {
    expect(() => searchTrains(-1, L)).toThrow('positive');
    expect(() => searchTrains(Infinity, L)).toThrow('positive');
    expect(() => searchTrains(2, { ...L, maxStages: 5 })).toThrow('between 1 and 3');
  });
});

describe('buildableStages', () => {
  it('reports the fewest stages for a fraction, or 0', () => {
    expect(buildableStages(12, 1, L)).toBe(1);
    expect(buildableStages(1440, 1, L)).toBe(3);
    expect(buildableStages(355, 113, L)).toBe(2);
    expect(buildableStages(355, 113, { ...L, maxTeeth: 110 })).toBe(0);
    expect(buildableStages(1439, 1, L)).toBe(0);
  });
});
