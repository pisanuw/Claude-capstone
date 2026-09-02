import { describe, expect, it } from 'vitest';
import { RRuleParseError, expandRRule, parseRRule } from '../src/core/rrule.js';
import type { WallTime } from '../src/core/types.js';
import { wallToIsoDate, wallToHhMm } from '../src/core/types.js';

// 2026-09-02 is a Wednesday.
const ANCHOR: WallTime = { year: 2026, month: 9, day: 2, hour: 0, minute: 0 };

const dates = (rule: string, days = 90, anchor = ANCHOR): string[] =>
  expandRRule(parseRRule(rule), anchor, days).map(wallToIsoDate);

describe('parseRRule', () => {
  it('parses a rich rule with and without the RRULE: prefix', () => {
    const r = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;BYHOUR=9;BYMINUTE=30');
    expect(r.freq).toBe('WEEKLY');
    expect(r.interval).toBe(2);
    expect(r.byDay).toEqual([
      { weekday: 1, ordinal: 0 },
      { weekday: 5, ordinal: 0 },
    ]);
    expect(r.byHour).toEqual([9]);
    expect(r.byMinute).toEqual([30]);
    expect(parseRRule('freq=daily').freq).toBe('DAILY');
  });

  it('parses ordinals, COUNT, and UNTIL', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=1MO').byDay).toEqual([{ weekday: 1, ordinal: 1 }]);
    expect(parseRRule('FREQ=MONTHLY;BYDAY=-1FR').byDay).toEqual([{ weekday: 5, ordinal: -1 }]);
    expect(parseRRule('FREQ=DAILY;COUNT=3').count).toBe(3);
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T120000Z').until).toEqual({
      year: 2026, month: 12, day: 31, hour: 12, minute: 0,
    });
  });

  it('rejects rules it cannot honour', () => {
    expect(() => parseRRule('INTERVAL=2')).toThrow(/FREQ/);
    expect(() => parseRRule('FREQ=SECONDLY')).toThrow(RRuleParseError);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=XX')).toThrow(/BYDAY/);
    expect(() => parseRRule('FREQ=DAILY;BYSETPOS=1')).toThrow(/unsupported/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=0MO')).toThrow(/ordinal/);
    expect(() => parseRRule('')).toThrow(/empty/);
  });
});

describe('expandRRule', () => {
  it('expands DAILY with INTERVAL from the anchor', () => {
    expect(dates('FREQ=DAILY;INTERVAL=2', 9)).toEqual([
      '2026-09-02', '2026-09-04', '2026-09-06', '2026-09-08', '2026-09-10',
    ]);
  });

  it('expands WEEKLY;INTERVAL=2 counting weeks from the anchor week', () => {
    // Anchor week is Mon Aug 31 - Sun Sep 6; its Monday already passed,
    // so the first every-other-week Monday is Sep 14.
    expect(dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', 30)).toEqual([
      '2026-09-14', '2026-09-28',
    ]);
  });

  it('expands MONTHLY on first Mondays', () => {
    expect(dates('FREQ=MONTHLY;BYDAY=1MO', 90)).toEqual([
      '2026-09-07', '2026-10-05', '2026-11-02',
    ]);
  });

  it('expands MONTHLY on the last Friday', () => {
    expect(dates('FREQ=MONTHLY;BYDAY=-1FR', 60)).toEqual(['2026-09-25', '2026-10-30']);
  });

  it('applies BYHOUR/BYMINUTE to day-based frequencies', () => {
    const fires = expandRRule(parseRRule('FREQ=DAILY;BYHOUR=9,17;BYMINUTE=15'), ANCHOR, 2);
    expect(fires.map((w) => `${wallToIsoDate(w)} ${wallToHhMm(w)}`)).toEqual([
      '2026-09-02 09:15', '2026-09-02 17:15', '2026-09-03 09:15', '2026-09-03 17:15',
    ]);
  });

  it('stops at COUNT occurrences', () => {
    expect(dates('FREQ=DAILY;COUNT=3', 90)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('stops at UNTIL (inclusive)', () => {
    expect(dates('FREQ=DAILY;UNTIL=20260904', 90)).toEqual([
      '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('skips occurrences on the anchor day that precede the anchor time', () => {
    const noon: WallTime = { ...ANCHOR, hour: 12 };
    const fires = expandRRule(parseRRule('FREQ=DAILY;BYHOUR=9'), noon, 3);
    expect(fires.map(wallToIsoDate)).toEqual(['2026-09-03', '2026-09-04']);
  });

  it('expands HOURLY and MINUTELY with filters', () => {
    const hourly = expandRRule(parseRRule('FREQ=HOURLY;INTERVAL=6'), ANCHOR, 1);
    expect(hourly.map(wallToHhMm)).toEqual(['00:00', '06:00', '12:00', '18:00']);
    const filtered = expandRRule(parseRRule('FREQ=MINUTELY;INTERVAL=30;BYHOUR=1'), ANCHOR, 1);
    expect(filtered.map(wallToHhMm)).toEqual(['01:00', '01:30']);
  });

  it('honours BYMONTH as a filter on DAILY rules', () => {
    const fires = dates('FREQ=DAILY;BYMONTH=10', 90);
    expect(fires[0]).toBe('2026-10-01');
    expect(fires[fires.length - 1]).toBe('2026-10-31');
    expect(fires.length).toBe(31);
  });
});
