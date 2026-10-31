import { describe, expect, it } from 'vitest';
import { countInversions, ms, rng, simulateLog, type LogConfig } from '../src/core/eventlog';
import { HISTORICAL_TABLE, findLeap, withExtraLeap, type LeapEntry } from '../src/core/leaps';

const leap = findLeap(HISTORICAL_TABLE, '2016-12-31') as LeapEntry;
const base: LogConfig = { clockA: 'step', clockB: 'smear24', spanSeconds: 3, meanGapMs: 50, latencyMs: 2, serviceMs: 5, resolutionMs: 1, seed: 7 };

describe('event log', () => {
  it('is deterministic for a seed', () => {
    const a = simulateLog(base, leap, HISTORICAL_TABLE);
    const b = simulateLog(base, leap, HISTORICAL_TABLE);
    expect(a.merged.map((e) => e.trueIndex)).toEqual(b.merged.map((e) => e.trueIndex));
    expect(a.requests).toBeGreaterThan(50);
    expect(a.events).toHaveLength(a.requests * 4);
  });

  it('step vs smear reorders lines and breaks causality', () => {
    const r = simulateLog(base, leap, HISTORICAL_TABLE);
    expect(r.inversions).toBeGreaterThan(0);
    expect(r.anomalies.some((x) => x.kind === 'causality')).toBe(true);
    expect(r.anomalies.some((x) => x.kind === 'backwards')).toBe(true);
    // With whole-second stamps the repeated second shows up as duplicate stamps.
    const coarse = simulateLog({ ...base, resolutionMs: 1000 }, leap, HISTORICAL_TABLE);
    expect(coarse.anomalies.some((x) => x.kind === 'duplicate')).toBe(true);
  });

  it('a step client sees negative round trips', () => {
    const r = simulateLog({ ...base, clockB: 'step', meanGapMs: 20, latencyMs: 300, serviceMs: 300 }, leap, HISTORICAL_TABLE);
    expect(r.badRtt).toBeGreaterThan(0);
    expect(r.anomalies.some((x) => x.kind === 'negative-rtt')).toBe(true);
  });

  it('monotonic clocks on both sides are clean', () => {
    const r = simulateLog({ ...base, clockA: 'tai', clockB: 'tai' }, leap, HISTORICAL_TABLE);
    expect(r.inversions).toBe(0);
    expect(r.anomalies).toHaveLength(0);
    expect(r.badRtt).toBe(0);
  });

  it('handles a negative leap', () => {
    const neg = withExtraLeap({ date: '2029-12-31', sign: -1 });
    const nl = findLeap(neg, '2029-12-31') as LeapEntry;
    const r = simulateLog({ ...base, clockA: 'smear24', clockB: 'step' }, nl, neg);
    expect(r.inversions).toBeGreaterThan(0);
  });

  it('helpers', () => {
    expect(countInversions([3, 1, 2])).toBe(2);
    expect(countInversions([])).toBe(0);
    expect(countInversions([1, 2, 3, 4, 5])).toBe(0);
    expect(countInversions([5, 4, 3, 2, 1])).toBe(10);
    expect(ms(0.0123)).toBe('12.3 ms');
    expect(ms(-0.5)).toBe('-500 ms');
    const r = rng(1);
    const x = r();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
    expect(rng(1)()).toBe(x);
  });
});
