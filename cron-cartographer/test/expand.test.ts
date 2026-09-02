import { describe, expect, it } from 'vitest';
import { parseCron } from '../src/core/cron.js';
import { parseRRule } from '../src/core/rrule.js';
import { NEXT_LIST_CAP, TIMES_PER_DAY_CAP, expandSchedule } from '../src/core/expand.js';

const SEP_2 = Date.UTC(2026, 8, 2); // 2026-09-02T00:00Z, a Wednesday

describe('expandSchedule with cron', () => {
  it('produces one cell per display-zone day, zeros included', () => {
    const r = expandSchedule(parseCron('0 12 * * 1'), {
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: 30,
      startMs: SEP_2,
    });
    expect(r.days.length).toBe(30);
    expect(r.days[0].date).toBe('2026-09-02');
    expect(r.days[r.days.length - 1].date).toBe('2026-10-01');
    // Mondays in the window: Sep 7, 14, 21, 28.
    expect(r.totalFirings).toBe(4);
    expect(r.daysWithFirings).toBe(4);
    expect(r.maxPerDay).toBe(1);
    const monday = r.days.find((d) => d.date === '2026-09-07');
    expect(monday?.count).toBe(1);
    expect(monday?.times).toEqual(['12:00']);
    expect(monday?.weekday).toBe(1);
    expect(r.days[0].count).toBe(0);
  });

  it('starts counting at the start instant, not the start of its day', () => {
    const r = expandSchedule(parseCron('0 3 * * *'), {
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: 30,
      startMs: SEP_2 + 6 * 3600 * 1000, // 06:00Z, after the 03:00 firing
    });
    expect(r.next[0].scheduleWall).toMatchObject({ month: 9, day: 3, hour: 3 });
    expect(r.totalFirings).toBe(30);
  });

  it('converts between schedule and display zones', () => {
    // Midnight in New York is 04:00 UTC during EDT.
    const r = expandSchedule(parseCron('0 0 * * *'), {
      scheduleZone: 'America/New_York',
      displayZone: 'UTC',
      horizonDays: 30,
      startMs: SEP_2,
    });
    expect(r.next[0].scheduleWall.hour).toBe(0);
    expect(r.next[0].displayWall.hour).toBe(4);
    // Midnight Sep 2 in New York is 04:00Z Sep 2, inside the window.
    expect(r.next[0].utcMs).toBe(Date.UTC(2026, 8, 2, 4, 0));
  });

  it('skips firings that fall into the DST spring-forward gap', () => {
    const r = expandSchedule(parseCron('30 2 * * *'), {
      scheduleZone: 'America/Los_Angeles',
      displayZone: 'America/Los_Angeles',
      horizonDays: 30,
      startMs: Date.UTC(2026, 2, 1, 12, 0),
    });
    // 2026-03-08 has no 02:30 in Los Angeles.
    expect(r.skippedInDstGap).toBe(1);
    expect(r.totalFirings).toBe(29);
    expect(r.days.find((d) => d.date === '2026-03-08')?.count).toBe(0);
  });

  it('fires ambiguous fall-back times once, at the earlier instant', () => {
    const r = expandSchedule(parseCron('30 1 * * *'), {
      scheduleZone: 'America/Los_Angeles',
      displayZone: 'UTC',
      horizonDays: 3,
      startMs: Date.UTC(2026, 9, 31, 12, 0),
    });
    // 2026-11-01 01:30 PDT == 08:30Z (not the 09:30Z PST reading).
    const nov1 = r.next.find((f) => f.scheduleWall.day === 1 && f.scheduleWall.month === 11);
    expect(nov1?.utcMs).toBe(Date.UTC(2026, 10, 1, 8, 30));
    expect(r.totalFirings).toBe(3);
  });

  it('caps stored per-day times and reports the overflow', () => {
    const r = expandSchedule(parseCron('* * * * *'), {
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: 30,
      startMs: SEP_2,
    });
    expect(r.totalFirings).toBe(30 * 1440);
    expect(r.maxPerDay).toBe(1440);
    expect(r.days[1].times.length).toBe(TIMES_PER_DAY_CAP);
    expect(r.days[1].more).toBe(1440 - TIMES_PER_DAY_CAP);
    expect(r.next.length).toBe(NEXT_LIST_CAP);
    expect(r.truncated).toBe(false);
  });

  it('handles a display zone east of the schedule zone', () => {
    const r = expandSchedule(parseCron('0 23 * * *'), {
      scheduleZone: 'UTC',
      displayZone: 'Asia/Tokyo',
      horizonDays: 30,
      startMs: SEP_2,
    });
    // 23:00Z is 08:00 next day in Tokyo.
    expect(r.next[0].displayWall.hour).toBe(8);
    expect(r.next[0].displayWall.day).toBe(3);
    expect(r.days[0].date).toBe('2026-09-02'); // Tokyo is already on Sep 2 at 00:00Z
  });
});

describe('expandSchedule with RRULE', () => {
  it('expands and aggregates an RRULE the same way', () => {
    const r = expandSchedule(parseRRule('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9'), {
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: 30,
      startMs: SEP_2,
    });
    // Fri Sep 4 is the first firing; Mondays and Fridays follow. Oct 2's
    // 09:00 falls past the 30-day end instant (Oct 2 00:00Z), so 8 in all.
    expect(r.next[0].scheduleWall).toMatchObject({ month: 9, day: 4, hour: 9 });
    expect(r.totalFirings).toBe(8);
    expect(r.days.find((d) => d.date === '2026-09-07')?.times).toEqual(['09:00']);
  });
});
