import { describe, expect, it } from 'vitest';
import {
  CronParseError,
  extractGithubActionsCrons,
  matchesDay,
  matchesWall,
  parseCron,
} from '../src/core/cron.js';

describe('parseCron', () => {
  it('parses a plain five-field expression', () => {
    const s = parseCron('15 4 * * 1-5');
    expect(s.minute.values).toEqual([15]);
    expect(s.hour.values).toEqual([4]);
    expect(s.dayOfMonth.values.length).toBe(31);
    expect(s.dayOfMonth.restricted).toBe(false);
    expect(s.month.values.length).toBe(12);
    expect(s.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    expect(s.dayOfWeek.restricted).toBe(true);
  });

  it('normalizes whitespace into the stored source', () => {
    expect(parseCron('  15   4 * *  1-5 ').source).toBe('15 4 * * 1-5');
  });

  it('expands @shortcuts', () => {
    expect(parseCron('@daily').source).toBe('0 0 * * *');
    expect(parseCron('@hourly').source).toBe('0 * * * *');
    expect(parseCron('@yearly').source).toBe('0 0 1 1 *');
    expect(parseCron('@weekly').dayOfWeek.values).toEqual([0]);
  });

  it('rejects unknown shortcuts', () => {
    expect(() => parseCron('@fortnightly')).toThrow(CronParseError);
  });

  it('handles steps on stars and ranges', () => {
    expect(parseCron('*/15 * * * *').minute.values).toEqual([0, 15, 30, 45]);
    expect(parseCron('1-10/3 * * * *').minute.values).toEqual([1, 4, 7, 10]);
    // Vixie semantics: "5/15" means "from 5 to max, step 15".
    expect(parseCron('5/15 * * * *').minute.values).toEqual([5, 20, 35, 50]);
  });

  it('handles lists and month/weekday names', () => {
    expect(parseCron('0 9,17 * * *').hour.values).toEqual([9, 17]);
    expect(parseCron('0 0 1 JAN,jul *').month.values).toEqual([1, 7]);
    expect(parseCron('0 9 * * mon,wed,fri').dayOfWeek.values).toEqual([1, 3, 5]);
    expect(parseCron('0 9 * * MON-FRI').dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('normalizes 7 to Sunday and supports wrap-around ranges', () => {
    expect(parseCron('0 0 * * 7').dayOfWeek.values).toEqual([0]);
    expect(parseCron('0 22 * * FRI-MON').dayOfWeek.values).toEqual([0, 1, 5, 6]);
    expect(parseCron('0 22-2 * * *').hour.values).toEqual([0, 1, 2, 22, 23]);
  });

  it('rejects malformed expressions with useful messages', () => {
    expect(() => parseCron('60 * * * *')).toThrow(/out of range/);
    expect(() => parseCron('* * * * * *')).toThrow(/seconds/);
    expect(() => parseCron('* * *')).toThrow(/expected 5 fields/);
    expect(() => parseCron('*/0 * * * *')).toThrow(/invalid step/);
    expect(() => parseCron('a * * * *')).toThrow(/cannot parse/);
    expect(() => parseCron('1,,2 * * * *')).toThrow(/empty list item/);
  });
});

describe('matchesDay / matchesWall', () => {
  // 2026-09-02 is a Wednesday.
  it('applies the dom/dow union rule only when both are restricted', () => {
    const union = parseCron('0 0 13 * 5'); // 13th OR any Friday
    expect(matchesDay(union, 2026, 9, 13)).toBe(true); // a Sunday, but the 13th
    expect(matchesDay(union, 2026, 9, 4)).toBe(true); // a Friday
    expect(matchesDay(union, 2026, 9, 2)).toBe(false); // neither

    const domOnly = parseCron('0 0 13 * *');
    expect(matchesDay(domOnly, 2026, 9, 13)).toBe(true);
    expect(matchesDay(domOnly, 2026, 9, 4)).toBe(false);

    const dowOnly = parseCron('0 0 * * 5');
    expect(matchesDay(dowOnly, 2026, 9, 4)).toBe(true);
    expect(matchesDay(dowOnly, 2026, 9, 13)).toBe(false);
  });

  it('treats "*/2" day-of-month as unrestricted for the union rule', () => {
    // Leading "*" keeps the field unrestricted (vixie rule), so dow must match.
    const s = parseCron('0 0 */2 * 1');
    expect(matchesDay(s, 2026, 9, 7)).toBe(true); // Monday the 7th (odd, step from 1)
    expect(matchesDay(s, 2026, 9, 3)).toBe(false); // Thursday the 3rd
  });

  it('matches exact wall times', () => {
    const s = parseCron('15 4 * * 1-5');
    expect(matchesWall(s, { year: 2026, month: 9, day: 2, hour: 4, minute: 15 })).toBe(true);
    expect(matchesWall(s, { year: 2026, month: 9, day: 2, hour: 4, minute: 16 })).toBe(false);
    expect(matchesWall(s, { year: 2026, month: 9, day: 6, hour: 4, minute: 15 })).toBe(false); // Sunday
  });

  it('respects the month field', () => {
    const s = parseCron('0 0 * JAN *');
    expect(matchesDay(s, 2026, 1, 10)).toBe(true);
    expect(matchesDay(s, 2026, 2, 10)).toBe(false);
  });
});

describe('extractGithubActionsCrons', () => {
  it('pulls cron lines out of an on.schedule snippet', () => {
    const yaml = [
      'on:',
      '  schedule:',
      "    - cron: '15 4 * * 1-5'",
      '    - cron: "0 12 * * 0"',
      '    - cron: 30 6 1 * *',
    ].join('\n');
    expect(extractGithubActionsCrons(yaml)).toEqual([
      '15 4 * * 1-5',
      '0 12 * * 0',
      '30 6 1 * *',
    ]);
  });

  it('returns [] when no cron keys are present', () => {
    expect(extractGithubActionsCrons('15 4 * * 1-5')).toEqual([]);
    expect(extractGithubActionsCrons('on: push')).toEqual([]);
  });
});
