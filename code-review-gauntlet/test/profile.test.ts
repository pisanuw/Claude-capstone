import { describe, expect, it } from 'vitest';
import {
  categoryAccuracy,
  defaultProfile,
  deserialize,
  loadProfile,
  recordRound,
  saveProfile,
  serialize,
  STORAGE_KEY,
} from '../src/core/profile';
import { generatePuzzle } from '../src/core/generate';
import { scoreRound } from '../src/core/score';
import { CATEGORIES } from '../src/core/types';

describe('serialize/deserialize', () => {
  it('round-trips a default profile', () => {
    const p = defaultProfile();
    expect(deserialize(serialize(p))).toEqual(p);
  });

  it('returns defaults for null, junk, wrong version, and wrong shapes', () => {
    const d = defaultProfile();
    expect(deserialize(null)).toEqual(d);
    expect(deserialize('not json')).toEqual(d);
    expect(deserialize('42')).toEqual(d);
    expect(deserialize('{"v":2,"gamesPlayed":9}')).toEqual(d);
    expect(deserialize('{"v":1,"gamesPlayed":"nine"}')).toEqual(d);
  });

  it('keeps valid fields and drops invalid ones', () => {
    const p = deserialize(
      JSON.stringify({
        v: 1,
        gamesPlayed: 3,
        bestScore: 220,
        totalScore: 400,
        categories: {
          logic: { attempts: 5, found: 3 },
          security: { attempts: 2, found: 9 }, // found > attempts: dropped
        },
        dailyDays: ['2026-08-20', 'garbage', '2026-08-19'],
        dailyScores: { '2026-08-20': 150, bad: 1, '2026-08-19': -2 },
      }),
    );
    expect(p.gamesPlayed).toBe(3);
    expect(p.categories.logic).toEqual({ attempts: 5, found: 3 });
    expect(p.categories.security).toEqual({ attempts: 0, found: 0 });
    expect(p.dailyDays).toEqual(['2026-08-19', '2026-08-20']);
    expect(p.dailyScores).toEqual({ '2026-08-20': 150 });
  });
});

describe('recordRound', () => {
  const puzzle = generatePuzzle(77, 'intermediate');

  it('accumulates games, scores, and category stats without mutating the input', () => {
    const before = defaultProfile();
    const result = scoreRound(puzzle, puzzle.defects.map((d) => d.line), 30);
    const after = recordRound(before, puzzle, result);

    expect(before).toEqual(defaultProfile());
    expect(after.gamesPlayed).toBe(1);
    expect(after.totalScore).toBe(result.score);
    expect(after.bestScore).toBe(result.score);
    const attempts = CATEGORIES.reduce((n, c) => n + after.categories[c].attempts, 0);
    const found = CATEGORIES.reduce((n, c) => n + after.categories[c].found, 0);
    expect(attempts).toBe(puzzle.defects.length);
    expect(found).toBe(puzzle.defects.length);
  });

  it('counts missed defects as attempts but not founds', () => {
    const result = scoreRound(puzzle, [], 0);
    const after = recordRound(defaultProfile(), puzzle, result);
    const attempts = CATEGORIES.reduce((n, c) => n + after.categories[c].attempts, 0);
    const found = CATEGORIES.reduce((n, c) => n + after.categories[c].found, 0);
    expect(attempts).toBe(puzzle.defects.length);
    expect(found).toBe(0);
  });

  it('records a daily day once and ignores replays', () => {
    const result = scoreRound(puzzle, puzzle.defects.map((d) => d.line), 10);
    const first = recordRound(defaultProfile(), puzzle, result, '2026-08-21');
    expect(first.dailyDays).toEqual(['2026-08-21']);
    expect(first.dailyScores['2026-08-21']).toBe(result.score);

    const replay = recordRound(first, puzzle, scoreRound(puzzle, [], 0), '2026-08-21');
    expect(replay).toEqual(first);
  });
});

describe('categoryAccuracy', () => {
  it('is null with no attempts and a ratio otherwise', () => {
    const p = defaultProfile();
    expect(categoryAccuracy(p, 'logic')).toBeNull();
    p.categories.logic = { attempts: 4, found: 3 };
    expect(categoryAccuracy(p, 'logic')).toBe(0.75);
  });
});

describe('loadProfile/saveProfile', () => {
  function fakeStorage(): { store: Map<string, string> } & {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
  } {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
    };
  }

  it('round-trips through a storage backend', () => {
    const storage = fakeStorage();
    const p = defaultProfile();
    p.gamesPlayed = 5;
    saveProfile(storage, p);
    expect(storage.store.has(STORAGE_KEY)).toBe(true);
    expect(loadProfile(storage)).toEqual(p);
  });

  it('survives a missing or throwing backend', () => {
    expect(loadProfile(null)).toEqual(defaultProfile());
    expect(() => saveProfile(null, defaultProfile())).not.toThrow();
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadProfile(throwing)).toEqual(defaultProfile());
    expect(() => saveProfile(throwing, defaultProfile())).not.toThrow();
  });
});
