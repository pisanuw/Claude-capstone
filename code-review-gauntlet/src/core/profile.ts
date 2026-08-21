import { CATEGORIES, type Category, type Profile, type Puzzle, type RoundResult } from './types';

export const STORAGE_KEY = 'code-review-gauntlet:v1';

export function defaultProfile(): Profile {
  const categories = {} as Record<Category, { attempts: number; found: number }>;
  for (const c of CATEGORIES) categories[c] = { attempts: 0, found: 0 };
  return {
    v: 1,
    gamesPlayed: 0,
    bestScore: 0,
    totalScore: 0,
    categories,
    dailyDays: [],
    dailyScores: {},
  };
}

export function serialize(profile: Profile): string {
  return JSON.stringify(profile);
}

function isStat(x: unknown): x is { attempts: number; found: number } {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.attempts === 'number' &&
    typeof s.found === 'number' &&
    Number.isFinite(s.attempts) &&
    Number.isFinite(s.found)
  );
}

/**
 * Parse persisted profile state. Returns a fresh default on any structural
 * problem (unknown version, malformed JSON, wrong shapes): corrupt local
 * state must never brick the app.
 */
export function deserialize(text: string | null): Profile {
  if (!text) return defaultProfile();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultProfile();
  }
  if (typeof raw !== 'object' || raw === null) return defaultProfile();
  const p = raw as Record<string, unknown>;
  if (p.v !== 1) return defaultProfile();

  const out = defaultProfile();
  if (typeof p.gamesPlayed === 'number' && p.gamesPlayed >= 0) out.gamesPlayed = Math.floor(p.gamesPlayed);
  if (typeof p.bestScore === 'number' && p.bestScore >= 0) out.bestScore = Math.floor(p.bestScore);
  if (typeof p.totalScore === 'number' && p.totalScore >= 0) out.totalScore = Math.floor(p.totalScore);

  if (typeof p.categories === 'object' && p.categories !== null) {
    for (const c of CATEGORIES) {
      const stat = (p.categories as Record<string, unknown>)[c];
      if (isStat(stat) && stat.found <= stat.attempts) out.categories[c] = { ...stat };
    }
  }
  if (Array.isArray(p.dailyDays)) {
    out.dailyDays = p.dailyDays
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  }
  if (typeof p.dailyScores === 'object' && p.dailyScores !== null) {
    for (const [day, score] of Object.entries(p.dailyScores as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof score === 'number' && score >= 0) {
        out.dailyScores[day] = Math.floor(score);
      }
    }
  }
  return out;
}

/**
 * Fold a finished round into the profile. For daily rounds only the first
 * attempt of a given day is recorded (there is no re-rolling the daily).
 */
export function recordRound(
  profile: Profile,
  puzzle: Puzzle,
  result: RoundResult,
  dailyDay: string | null = null,
): Profile {
  const next: Profile = {
    ...profile,
    categories: Object.fromEntries(
      Object.entries(profile.categories).map(([k, v]) => [k, { ...v }]),
    ) as Profile['categories'],
    dailyDays: [...profile.dailyDays],
    dailyScores: { ...profile.dailyScores },
  };

  if (dailyDay !== null && dailyDay in next.dailyScores) {
    return next; // replayed daily: nothing counts
  }

  next.gamesPlayed += 1;
  next.totalScore += result.score;
  next.bestScore = Math.max(next.bestScore, result.score);
  for (const defect of puzzle.defects) {
    const stat = next.categories[defect.category];
    stat.attempts += 1;
    if (result.found.some((f) => f.mutationId === defect.mutationId)) stat.found += 1;
  }
  if (dailyDay !== null) {
    next.dailyDays = [...next.dailyDays, dailyDay].sort();
    next.dailyScores[dailyDay] = result.score;
  }
  return next;
}

/** Per-category accuracy in [0, 1], or null with no attempts yet. */
export function categoryAccuracy(profile: Profile, category: Category): number | null {
  const stat = profile.categories[category];
  if (stat.attempts === 0) return null;
  return stat.found / stat.attempts;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Load the profile; any storage failure (private mode, quota) yields a default. */
export function loadProfile(storage: StorageLike | null): Profile {
  if (!storage) return defaultProfile();
  try {
    return deserialize(storage.getItem(STORAGE_KEY));
  } catch {
    return defaultProfile();
  }
}

/** Persist the profile; storage failures are silently ignored. */
export function saveProfile(storage: StorageLike | null, profile: Profile): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, serialize(profile));
  } catch {
    /* private mode / quota: play on without persistence */
  }
}
