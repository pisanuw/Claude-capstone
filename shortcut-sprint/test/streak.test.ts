import { describe, expect, it } from 'vitest';
import { computeStreak, recordDay } from '../src/core/streak';
import { dayNumber, dayNumberFromIso, isoDate } from '../src/core/dates';

describe('computeStreak', () => {
  it('is zero with no practice days', () => {
    expect(computeStreak([], '2026-08-20')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-08-18', '2026-08-19', '2026-08-20'], '2026-08-20')).toBe(3);
  });

  it('keeps the streak alive if today has no practice yet', () => {
    expect(computeStreak(['2026-08-18', '2026-08-19'], '2026-08-20')).toBe(2);
  });

  it('dies after a missed day', () => {
    expect(computeStreak(['2026-08-17', '2026-08-18'], '2026-08-20')).toBe(0);
  });

  it('ignores gaps further back', () => {
    expect(computeStreak(['2026-08-10', '2026-08-19', '2026-08-20'], '2026-08-20')).toBe(2);
  });

  it('handles month boundaries', () => {
    expect(computeStreak(['2026-07-31', '2026-08-01'], '2026-08-01')).toBe(2);
  });
});

describe('recordDay', () => {
  it('adds new days sorted and deduplicates', () => {
    const days = recordDay(['2026-08-19'], '2026-08-18');
    expect(days).toEqual(['2026-08-18', '2026-08-19']);
    expect(recordDay(days, '2026-08-19')).toBe(days);
  });
});

describe('dates', () => {
  it('isoDate and dayNumber agree with dayNumberFromIso', () => {
    const d = new Date(2026, 7, 20, 14, 30);
    expect(isoDate(d)).toBe('2026-08-20');
    expect(dayNumber(d)).toBe(dayNumberFromIso('2026-08-20'));
  });

  it('dayNumberFromIso rejects malformed dates', () => {
    expect(() => dayNumberFromIso('yesterday')).toThrow(/bad date/);
  });

  it('consecutive dates differ by one day number', () => {
    expect(dayNumberFromIso('2026-03-01') - dayNumberFromIso('2026-02-28')).toBe(1);
    expect(dayNumberFromIso('2026-01-01') - dayNumberFromIso('2025-12-31')).toBe(1);
  });
});
