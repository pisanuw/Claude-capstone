import { describe, expect, it } from 'vitest';
import { computeStreak, dayNumberFromIso, isoToday } from '../src/core/dates';

describe('isoToday', () => {
  it('formats local dates with zero padding', () => {
    expect(isoToday(new Date(2026, 0, 5, 14, 30))).toBe('2026-01-05');
    expect(isoToday(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('dayNumberFromIso', () => {
  it('is consecutive across month boundaries', () => {
    expect(dayNumberFromIso('2026-09-01') - dayNumberFromIso('2026-08-31')).toBe(1);
    expect(dayNumberFromIso('2027-01-01') - dayNumberFromIso('2026-12-31')).toBe(1);
  });
});

describe('computeStreak', () => {
  const today = '2026-08-21';

  it('is 0 with no days', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts a run ending today', () => {
    expect(computeStreak(['2026-08-19', '2026-08-20', '2026-08-21'], today)).toBe(3);
  });

  it('keeps a streak alive when today is not played yet', () => {
    expect(computeStreak(['2026-08-19', '2026-08-20'], today)).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(computeStreak(['2026-08-18', '2026-08-19'], today)).toBe(0);
  });

  it('ignores gaps earlier in history', () => {
    expect(computeStreak(['2026-08-10', '2026-08-20', '2026-08-21'], today)).toBe(2);
  });
});
