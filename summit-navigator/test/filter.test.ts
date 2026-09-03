import { describe, expect, it } from 'vitest';
import {
  emptyFilter,
  hasActiveFilter,
  matchesQuery,
  filterSessions,
} from '../src/core/filter';
import { makeSession } from './helpers';

const trackNames = new Map([
  ['plenary', { name: 'Plenary' }],
  ['systems', { name: 'Systems' }],
]);

describe('emptyFilter / hasActiveFilter', () => {
  it('starts inactive and detects each dimension', () => {
    const f = emptyFilter();
    expect(hasActiveFilter(f)).toBe(false);
    expect(hasActiveFilter({ ...f, query: '  ' })).toBe(false);
    expect(hasActiveFilter({ ...f, query: 'ai' })).toBe(true);
    expect(hasActiveFilter({ ...f, tracks: new Set(['plenary']) })).toBe(true);
    expect(hasActiveFilter({ ...f, starredOnly: true })).toBe(true);
  });
});

describe('matchesQuery', () => {
  const s = makeSession({
    title: 'Keynote: Reinforcement Learning',
    speakers: ['Andrew Barto'],
    room: 'Centennial Ballroom',
    description: 'A Turing laureate reflects.',
  });

  it('matches on title, speaker, room, track name, and description', () => {
    expect(matchesQuery(s, 'Plenary', 'reinforcement')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'barto')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'centennial')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'plenary')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'laureate')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'quantum')).toBe(false);
  });

  it('requires every term to match', () => {
    expect(matchesQuery(s, 'Plenary', 'barto keynote')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'barto quantum')).toBe(false);
  });

  it('is case-insensitive and treats blank queries as match-all', () => {
    expect(matchesQuery(s, 'Plenary', '')).toBe(true);
    expect(matchesQuery(s, 'Plenary', '   ')).toBe(true);
    expect(matchesQuery(s, 'Plenary', 'BARTO')).toBe(true);
  });
});

describe('filterSessions', () => {
  const sessions = [
    makeSession({ id: 'k', track: 'plenary', title: 'Opening Keynote' }),
    makeSession({ id: 's1', track: 'systems', title: 'Datacenters', speakers: [] }),
    makeSession({ id: 's2', track: 'systems', title: 'Reliability', speakers: [] }),
  ];

  it('applies track filters (empty set means all)', () => {
    const all = filterSessions(sessions, emptyFilter(), trackNames, new Set());
    expect(all).toHaveLength(3);
    const f = { ...emptyFilter(), tracks: new Set(['systems']) };
    expect(filterSessions(sessions, f, trackNames, new Set()).map((s) => s.id)).toEqual([
      's1',
      's2',
    ]);
  });

  it('applies starredOnly against the starred set', () => {
    const f = { ...emptyFilter(), starredOnly: true };
    expect(filterSessions(sessions, f, trackNames, new Set())).toEqual([]);
    expect(
      filterSessions(sessions, f, trackNames, new Set(['s2'])).map((s) => s.id),
    ).toEqual(['s2']);
  });

  it('combines query, track, and stars', () => {
    const f = {
      query: 'reliability',
      tracks: new Set(['systems']),
      starredOnly: true,
    };
    expect(
      filterSessions(sessions, f, trackNames, new Set(['s1', 's2'])).map((s) => s.id),
    ).toEqual(['s2']);
  });

  it('tolerates sessions whose track id is missing from the map', () => {
    const stray = [makeSession({ id: 'x', track: 'plenary' })];
    const empty = new Map<string, { name: string }>();
    expect(filterSessions(stray, emptyFilter(), empty, new Set())).toHaveLength(1);
  });
});
