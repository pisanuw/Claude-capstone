import { describe, expect, it } from 'vitest';
import { CLOCKS, clockDrift, clockInfo, readClock, smearRate, smearWindow } from '../src/core/clocks';
import { HISTORICAL_TABLE, findLeap, parseToTai, withExtraLeap, type LeapEntry } from '../src/core/leaps';

const leap = findLeap(HISTORICAL_TABLE, '2016-12-31') as LeapEntry;
const neg = withExtraLeap({ date: '2029-12-31', sign: -1 });
const negLeap = findLeap(neg, '2029-12-31') as LeapEntry;
const midnight = 1483228800;

describe('clocks', () => {
  it('describes every clock', () => {
    expect(CLOCKS.map((c) => c.kind)).toEqual(['step', 'smear24', 'utcsls', 'monotonic', 'tai']);
    expect(clockInfo('smear24').short).toBe('smear');
  });

  it('step clock repeats a second', () => {
    expect(readClock('step', parseToTai('2016-12-31T23:59:60.5Z'), leap, HISTORICAL_TABLE)).toBeCloseTo(midnight - 0.5, 6);
    expect(clockDrift('step', parseToTai('2017-01-01T00:00:01Z'), leap, HISTORICAL_TABLE)).toBeCloseTo(-1, 9);
  });

  it('24 h smear is half a second off at midnight and exact at the edges', () => {
    const atLeap = parseToTai('2016-12-31T23:59:60Z');
    expect(clockDrift('smear24', atLeap, leap, HISTORICAL_TABLE)).toBeCloseTo(-0.5, 4);
    const w = smearWindow(leap, 'smear24');
    expect(readClock('smear24', w.taiStart, leap, HISTORICAL_TABLE)).toBe(midnight - 43200);
    expect(readClock('smear24', w.taiEnd, leap, HISTORICAL_TABLE)).toBe(midnight + 43200);
    expect(readClock('smear24', w.taiEnd + 10, leap, HISTORICAL_TABLE)).toBe(midnight + 43210);
    expect(smearRate(leap, 'smear24')).toBeCloseTo(86400 / 86401, 12);
  });

  it('UTC-SLS ends exactly at midnight', () => {
    const w = smearWindow(leap, 'utcsls');
    expect(w.taiEnd - w.taiStart).toBe(1001);
    expect(readClock('utcsls', parseToTai('2017-01-01T00:00:00Z'), leap, HISTORICAL_TABLE)).toBe(midnight);
    expect(smearRate(leap, 'utcsls')).toBeCloseTo(1000 / 1001, 12);
  });

  it('negative smear runs fast', () => {
    expect(smearRate(negLeap, 'smear24')).toBeCloseTo(86400 / 86399, 12);
    expect(clockDrift('step', negLeap.taiAt + 1, negLeap, neg)).toBeCloseTo(1, 9);
  });

  it('monotonic and TAI ignore the leap', () => {
    const t = parseToTai('2016-12-31T23:59:60Z');
    expect(readClock('monotonic', t, leap, HISTORICAL_TABLE, t - 5)).toBe(5);
    expect(readClock('monotonic', t, leap, HISTORICAL_TABLE)).toBe(3599);
    expect(readClock('tai', t, leap, HISTORICAL_TABLE)).toBe(t);
    expect(clockDrift('monotonic', t, leap, HISTORICAL_TABLE)).toBe(0);
    expect(clockDrift('tai', t, leap, HISTORICAL_TABLE)).toBe(0);
  });
});
