import { describe, expect, it } from 'vitest';
import {
  validateSchedule,
  sessionsForDay,
  groupByStart,
  dayLabel,
  trackMap,
} from '../src/core/schedule';
import { makeSchedule, makeSession } from './helpers';

describe('validateSchedule', () => {
  it('accepts a well-formed schedule', () => {
    const data = makeSchedule();
    expect(validateSchedule(data)).toBe(data);
  });

  it('rejects non-object roots', () => {
    expect(() => validateSchedule(null)).toThrow(/root/);
    expect(() => validateSchedule('nope')).toThrow(/root/);
  });

  it('rejects a missing or incomplete conference block', () => {
    expect(() => validateSchedule({ days: ['2026-08-31'] })).toThrow(/conference/);
    const bad = makeSchedule();
    bad.conference = { ...bad.conference, timeZone: '' };
    expect(() => validateSchedule(bad)).toThrow(/timeZone/);
  });

  it('rejects bad day lists', () => {
    expect(() => validateSchedule(makeSchedule({ days: [] }))).toThrow(/days/);
    expect(() => validateSchedule(makeSchedule({ days: ['Aug 31'] }))).toThrow(/bad day/);
    expect(() =>
      validateSchedule(makeSchedule({ days: ['2026-09-01', '2026-08-31'] })),
    ).toThrow(/sorted/);
    expect(() =>
      validateSchedule(makeSchedule({ days: ['2026-08-31', '2026-08-31'] })),
    ).toThrow(/unique/);
  });

  it('rejects bad tracks', () => {
    expect(() => validateSchedule(makeSchedule({ tracks: [] }))).toThrow(/tracks/);
    expect(() =>
      validateSchedule(
        makeSchedule({
          tracks: [
            { id: 'a', name: 'A', color: '#112233' },
            { id: 'a', name: 'B', color: '#112233' },
          ],
        }),
      ),
    ).toThrow(/duplicate track/);
    expect(() =>
      validateSchedule(makeSchedule({ tracks: [{ id: 'a', name: 'A', color: 'red' }] })),
    ).toThrow(/color/);
    expect(() =>
      validateSchedule(makeSchedule({ tracks: [{ id: 'a', name: '', color: '#112233' }] })),
    ).toThrow(/name/);
  });

  it('rejects bad sessions', () => {
    const dup = makeSchedule({ sessions: [makeSession(), makeSession()] });
    expect(() => validateSchedule(dup)).toThrow(/duplicate session/);

    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ day: '2026-12-25' })] })),
    ).toThrow(/unknown day/);
    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ start: '9:00' })] })),
    ).toThrow(/bad start/);
    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ end: '25:00' })] })),
    ).toThrow(/bad end/);
    expect(() =>
      validateSchedule(
        makeSchedule({ sessions: [makeSession({ start: '10:00', end: '10:00' })] }),
      ),
    ).toThrow(/end after/);
    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ track: 'ghost' })] })),
    ).toThrow(/unknown track/);
    expect(() =>
      validateSchedule(
        makeSchedule({
          sessions: [makeSession({ kind: 'concert' as unknown as 'keynote' })],
        }),
      ),
    ).toThrow(/unknown kind/);
    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ title: '' })] })),
    ).toThrow(/title/);
    expect(() =>
      validateSchedule(makeSchedule({ sessions: [makeSession({ room: '' })] })),
    ).toThrow(/room/);
    expect(() =>
      validateSchedule(
        makeSchedule({ sessions: [makeSession({ speakers: ['ok', ''] })] }),
      ),
    ).toThrow(/speakers/);
    expect(() => validateSchedule(makeSchedule({ sessions: [] }))).toThrow(/sessions/);
  });
});

describe('sessionsForDay', () => {
  it('filters to the day and sorts by start, end, then title', () => {
    const data = makeSchedule({
      sessions: [
        makeSession({ id: 'b', day: '2026-08-31', start: '10:30', end: '12:00', title: 'B' }),
        makeSession({ id: 'other-day', day: '2026-09-01', start: '08:00', end: '09:00' }),
        makeSession({ id: 'a2', day: '2026-08-31', start: '09:00', end: '10:00', title: 'Zeta' }),
        makeSession({ id: 'a1', day: '2026-08-31', start: '09:00', end: '10:00', title: 'Alpha' }),
        makeSession({ id: 'a3', day: '2026-08-31', start: '09:00', end: '09:30', title: 'Short' }),
      ],
    });
    const ids = sessionsForDay(data, '2026-08-31').map((s) => s.id);
    expect(ids).toEqual(['a3', 'a1', 'a2', 'b']);
  });
});

describe('groupByStart', () => {
  it('groups consecutive sessions sharing a start time', () => {
    const data = makeSchedule({
      sessions: [
        makeSession({ id: 'x', start: '09:00', end: '10:00' }),
        makeSession({ id: 'y', start: '09:00', end: '10:30', title: 'Parallel' }),
        makeSession({ id: 'z', start: '10:30', end: '11:00', title: 'Later' }),
      ],
    });
    const blocks = groupByStart(sessionsForDay(data, '2026-08-31'));
    expect(blocks.map((b) => b.start)).toEqual(['09:00', '10:30']);
    expect(blocks[0].sessions.map((s) => s.id).sort()).toEqual(['x', 'y']);
    expect(blocks[1].sessions).toHaveLength(1);
  });

  it('returns no blocks for no sessions', () => {
    expect(groupByStart([])).toEqual([]);
  });
});

describe('dayLabel', () => {
  it('labels days independent of the host timezone', () => {
    expect(dayLabel('2026-08-30')).toEqual({ weekday: 'Sun', label: 'Aug 30' });
    expect(dayLabel('2026-09-02')).toEqual({ weekday: 'Wed', label: 'Sep 2' });
    expect(dayLabel('2026-01-01')).toEqual({ weekday: 'Thu', label: 'Jan 1' });
  });
});

describe('trackMap', () => {
  it('maps track ids to name and color', () => {
    const map = trackMap(makeSchedule());
    expect(map.get('plenary')).toEqual({ name: 'Plenary', color: '#6d28d9' });
    expect(map.has('ghost')).toBe(false);
  });
});
