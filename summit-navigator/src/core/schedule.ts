import type { ScheduleData, Session, TimeBlock } from './types';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const KINDS = new Set(['keynote', 'panel', 'talks', 'workshop', 'papers', 'break', 'social']);

function fail(msg: string): never {
  throw new Error(`schedule: ${msg}`);
}

/**
 * Validate a parsed schedule.json. Throws with a pointed message on the first
 * problem found so a bad data drop-in fails loudly at startup, not silently
 * in the UI.
 */
export function validateSchedule(raw: unknown): ScheduleData {
  if (typeof raw !== 'object' || raw === null) fail('root must be an object');
  const data = raw as ScheduleData;

  const c = data.conference;
  if (!c || typeof c !== 'object') fail('missing conference block');
  for (const key of ['name', 'shortName', 'venue', 'city', 'timeZone', 'website', 'dataNote'] as const) {
    if (typeof c[key] !== 'string' || c[key].length === 0) fail(`conference.${key} must be a non-empty string`);
  }

  if (!Array.isArray(data.days) || data.days.length === 0) fail('days must be a non-empty array');
  for (const d of data.days) {
    if (typeof d !== 'string' || !DAY_RE.test(d)) fail(`bad day "${String(d)}"`);
  }
  const sortedDays = [...data.days].sort();
  if (sortedDays.some((d, i) => d !== data.days[i])) fail('days must be sorted ascending');
  if (new Set(data.days).size !== data.days.length) fail('days must be unique');

  if (!Array.isArray(data.tracks) || data.tracks.length === 0) fail('tracks must be a non-empty array');
  const trackIds = new Set<string>();
  for (const t of data.tracks) {
    if (!t || typeof t.id !== 'string' || t.id.length === 0) fail('every track needs an id');
    if (trackIds.has(t.id)) fail(`duplicate track id "${t.id}"`);
    trackIds.add(t.id);
    if (typeof t.name !== 'string' || t.name.length === 0) fail(`track "${t.id}" needs a name`);
    if (typeof t.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(t.color)) {
      fail(`track "${t.id}" needs a #rrggbb color`);
    }
  }

  if (!Array.isArray(data.sessions) || data.sessions.length === 0) fail('sessions must be a non-empty array');
  const dayset = new Set(data.days);
  const ids = new Set<string>();
  for (const s of data.sessions) {
    if (!s || typeof s.id !== 'string' || s.id.length === 0) fail('every session needs an id');
    if (ids.has(s.id)) fail(`duplicate session id "${s.id}"`);
    ids.add(s.id);
    if (!dayset.has(s.day)) fail(`session "${s.id}" has unknown day "${s.day}"`);
    if (!TIME_RE.test(s.start)) fail(`session "${s.id}" has bad start "${s.start}"`);
    if (!TIME_RE.test(s.end)) fail(`session "${s.id}" has bad end "${s.end}"`);
    if (s.end <= s.start) fail(`session "${s.id}" must end after it starts`);
    if (typeof s.title !== 'string' || s.title.length === 0) fail(`session "${s.id}" needs a title`);
    if (!KINDS.has(s.kind)) fail(`session "${s.id}" has unknown kind "${String(s.kind)}"`);
    if (!trackIds.has(s.track)) fail(`session "${s.id}" has unknown track "${s.track}"`);
    if (typeof s.room !== 'string' || s.room.length === 0) fail(`session "${s.id}" needs a room`);
    if (!Array.isArray(s.speakers) || s.speakers.some((sp) => typeof sp !== 'string' || sp.length === 0)) {
      fail(`session "${s.id}" has a bad speakers list`);
    }
  }

  return data;
}

/** All sessions on one day, ordered by start, then end, then title. */
export function sessionsForDay(data: ScheduleData, day: string): Session[] {
  return data.sessions
    .filter((s) => s.day === day)
    .sort((a, b) =>
      a.start !== b.start
        ? a.start.localeCompare(b.start)
        : a.end !== b.end
          ? a.end.localeCompare(b.end)
          : a.title.localeCompare(b.title),
    );
}

/** Group an already-sorted session list into blocks sharing a start time. */
export function groupByStart(sessions: Session[]): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  for (const s of sessions) {
    const last = blocks[blocks.length - 1];
    if (last && last.start === s.start) last.sessions.push(s);
    else blocks.push({ start: s.start, sessions: [s] });
  }
  return blocks;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-30" -> { weekday: "Sun", label: "Aug 30" }, independent of host TZ. */
export function dayLabel(day: string): { weekday: string; label: string } {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { weekday, label: `${MONTHS[m - 1]} ${d}` };
}

/** Map of track id -> track, for chip rendering and search. */
export function trackMap(data: ScheduleData): Map<string, { name: string; color: string }> {
  return new Map(data.tracks.map((t) => [t.id, { name: t.name, color: t.color }]));
}
