import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, leapYears, leapsAvoided, projection, schematicHistory, ut1MinusUtc, yearOfPosix, yearsUntil } from '../src/core/ut1';

describe('UT1 − UTC', () => {
  it('decimal years', () => {
    expect(yearOfPosix(Date.UTC(2017, 0, 1) / 1000)).toBe(2017);
    expect(yearOfPosix(Date.UTC(2017, 6, 2, 12) / 1000)).toBeCloseTo(2017.5, 2);
    expect(leapYears()).toHaveLength(27);
  });

  it('schematic history stays within ±0.5 s', () => {
    for (let y = 1972; y < 2027; y += 0.13) {
      const v = schematicHistory(y);
      expect(v).toBeLessThanOrEqual(0.5);
      expect(v).toBeGreaterThanOrEqual(-0.5);
    }
    expect(schematicHistory(1960)).toBe(0.5);
    expect(schematicHistory(2026.9)).toBe(-0.5);
  });

  it('projection drifts negative for a slow Earth and switches at the cutover', () => {
    expect(projection(DEFAULT_MODEL, DEFAULT_MODEL.cutoverYear)).toBe(0);
    expect(projection(DEFAULT_MODEL, 2127)).toBeLessThan(-18);
    expect(ut1MinusUtc(DEFAULT_MODEL, 2000)).toBe(schematicHistory(2000));
    expect(ut1MinusUtc(DEFAULT_MODEL, 2100)).toBe(projection(DEFAULT_MODEL, 2100));
  });

  it('solves for the year a limit is reached', () => {
    const t = yearsUntil(DEFAULT_MODEL, 3600) as number;
    expect(t).toBeGreaterThan(100);
    expect(Math.abs(projection(DEFAULT_MODEL, DEFAULT_MODEL.cutoverYear + t))).toBeCloseTo(3600, 3);
    const linear = { ...DEFAULT_MODEL, trendMsPerCentury: 0, lodExcessMs: 1 };
    expect(yearsUntil(linear, 1)).toBeCloseTo(1000 / 365.25, 6);
    const fast = { ...DEFAULT_MODEL, trendMsPerCentury: 0, lodExcessMs: -1 };
    expect(yearsUntil(fast, 1)).toBeCloseTo(1000 / 365.25, 6);
    expect(yearsUntil({ ...DEFAULT_MODEL, trendMsPerCentury: 0, lodExcessMs: 0 }, 1)).toBeNull();
    expect(yearsUntil({ ...DEFAULT_MODEL, trendMsPerCentury: -1, lodExcessMs: 0 }, 1e9, 100)).toBeNull();
  });

  it('counts leap seconds the old rule would have needed', () => {
    expect(leapsAvoided(DEFAULT_MODEL, 2000)).toBe(0);
    expect(leapsAvoided(DEFAULT_MODEL, 2127)).toBeGreaterThan(15);
    expect(leapsAvoided({ ...DEFAULT_MODEL, lodExcessMs: -2, trendMsPerCentury: 0 }, 2037)).toBeLessThan(0);
  });
});
