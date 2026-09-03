import type { Session } from './types';

export interface FilterState {
  /** Free-text query; empty string means no text filter. */
  query: string;
  /** Selected track ids; empty set means all tracks. */
  tracks: Set<string>;
  /** Restrict to the starred personal agenda. */
  starredOnly: boolean;
}

export function emptyFilter(): FilterState {
  return { query: '', tracks: new Set(), starredOnly: false };
}

export function hasActiveFilter(f: FilterState): boolean {
  return f.query.trim().length > 0 || f.tracks.size > 0 || f.starredOnly;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * Does a session match a free-text query? Matches on title, speakers, room,
 * and the human-readable track name (every whitespace-separated term must
 * match somewhere).
 */
export function matchesQuery(s: Session, trackName: string, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(
    [s.title, s.room, trackName, ...s.speakers, s.description ?? ''].join(' '),
  );
  return terms.every((t) => haystack.includes(t));
}

export function filterSessions(
  sessions: Session[],
  filter: FilterState,
  trackNames: Map<string, { name: string }>,
  starred: ReadonlySet<string>,
): Session[] {
  return sessions.filter((s) => {
    if (filter.starredOnly && !starred.has(s.id)) return false;
    if (filter.tracks.size > 0 && !filter.tracks.has(s.track)) return false;
    const trackName = trackNames.get(s.track)?.name ?? '';
    return matchesQuery(s, trackName, filter.query);
  });
}
