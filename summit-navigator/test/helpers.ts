import type { ScheduleData, Session } from '../src/core/types';

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    day: '2026-08-31',
    start: '09:00',
    end: '10:00',
    title: 'Opening Keynote',
    kind: 'keynote',
    track: 'plenary',
    room: 'Main Hall',
    speakers: ['Ada Lovelace'],
    ...overrides,
  };
}

export function makeSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    conference: {
      name: 'Test Conference 2026',
      shortName: 'TestConf',
      venue: 'Test Hotel',
      city: 'Testville, USA',
      timeZone: 'America/New_York',
      website: 'https://example.com/program',
      dataNote: 'Test data.',
    },
    tracks: [
      { id: 'plenary', name: 'Plenary', color: '#6d28d9' },
      { id: 'systems', name: 'Systems', color: '#1d4ed8' },
    ],
    days: ['2026-08-31', '2026-09-01'],
    sessions: [makeSession()],
    ...overrides,
  };
}
