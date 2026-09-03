import { describe, expect, it } from 'vitest';
import rawSchedule from '../src/data/schedule.json';
import { validateSchedule, sessionsForDay } from '../src/core/schedule';
import { epochFor } from '../src/core/clock';

describe('bundled schedule.json', () => {
  const data = validateSchedule(rawSchedule);

  it('covers the four summit days', () => {
    expect(data.days).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    expect(data.conference.timeZone).toBe('America/New_York');
  });

  it('has sessions on every day', () => {
    for (const day of data.days) {
      expect(sessionsForDay(data, day).length).toBeGreaterThan(0);
    }
  });

  it('has a plenary keynote on each of the three main days', () => {
    for (const day of ['2026-08-31', '2026-09-01', '2026-09-02']) {
      const keynotes = sessionsForDay(data, day).filter(
        (s) => s.kind === 'keynote' && s.track === 'plenary',
      );
      expect(keynotes.length).toBeGreaterThan(0);
    }
  });

  it('is honest about its provenance', () => {
    expect(data.conference.dataNote).toMatch(/[Uu]nofficial/);
    expect(data.conference.website).toContain('aisummit.acm.org');
  });

  it('has sessions whose instants are computable and ordered', () => {
    for (const s of data.sessions) {
      const start = epochFor(s.day, s.start, data.conference.timeZone);
      const end = epochFor(s.day, s.end, data.conference.timeZone);
      expect(end).toBeGreaterThan(start);
    }
  });

  it('does not overbook a room at one moment on one day', () => {
    for (const day of data.days) {
      const byRoom = new Map<string, { start: string; end: string; id: string }[]>();
      for (const s of sessionsForDay(data, day)) {
        const list = byRoom.get(s.room) ?? [];
        for (const other of list) {
          const overlaps = s.start < other.end && other.start < s.end;
          expect(
            overlaps,
            `${s.id} overlaps ${other.id} in ${s.room} on ${day}`,
          ).toBe(false);
        }
        list.push({ start: s.start, end: s.end, id: s.id });
        byRoom.set(s.room, list);
      }
    }
  });
});
