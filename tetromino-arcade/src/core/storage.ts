// Local persistence: high scores, settings, lifetime stats and best replays.
// Everything goes through a tiny key-value interface so tests can use an
// in-memory store and a browser that blocks storage still works.

import type { GameStats } from './game';
import { MODES, type ModeId } from './modes';
import { DEFAULT_HANDLING, KEYS, type Handling, type Key, type Replay } from './session';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKV implements KV {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** localStorage when it works, otherwise an in-memory fallback. */
export function browserKV(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ta_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryKV();
  }
}

export interface ScoreEntry {
  name: string;
  score: number;
  lines: number;
  frames: number;
  level: number;
  won: boolean;
  date: string;
}

export type Theme = 'classic' | 'neon' | 'pastel' | 'mono';

export interface Settings {
  handling: Handling;
  bindings: Record<Key, string[]>;
  ghost: boolean;
  grid: boolean;
  hint: boolean;
  particles: boolean;
  shake: boolean;
  volume: number;
  music: boolean;
  theme: Theme;
  startLevel: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'insane';
  name: string;
}

export const DEFAULT_BINDINGS: Record<Key, string[]> = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  soft: ['ArrowDown'],
  hard: ['Space'],
  cw: ['ArrowUp', 'KeyX'],
  ccw: ['KeyZ', 'ControlLeft'],
  r180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft'],
};

export const DEFAULT_SETTINGS: Settings = {
  handling: { ...DEFAULT_HANDLING },
  bindings: DEFAULT_BINDINGS,
  ghost: true,
  grid: true,
  hint: false,
  particles: true,
  shake: true,
  volume: 0.5,
  music: false,
  theme: 'classic',
  startLevel: 1,
  difficulty: 'normal',
  name: 'Player',
};

export interface Lifetime {
  games: number;
  frames: number;
  pieces: number;
  lines: number;
  tetrises: number;
  tspins: number;
  perfectClears: number;
  bestCombo: number;
  versusWins: number;
  versusLosses: number;
}

const EMPTY_LIFETIME: Lifetime = {
  games: 0, frames: 0, pieces: 0, lines: 0, tetrises: 0, tspins: 0,
  perfectClears: 0, bestCombo: 0, versusWins: 0, versusLosses: 0,
};

const PREFIX = 'tetromino-arcade:';
export const MAX_SCORES = 10;

/** Better-first comparison for a mode's leaderboard. */
export function compareEntries(mode: ModeId, a: ScoreEntry, b: ScoreEntry): number {
  if (MODES[mode].rankBy === 'time') {
    // Finished runs beat unfinished ones; among finished, faster is better.
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.won) return a.frames - b.frames;
    return b.lines - a.lines;
  }
  return b.score - a.score;
}

export class Records {
  constructor(private readonly kv: KV) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.kv.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.kv.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Quota or privacy mode: the game keeps working without saving.
    }
  }

  scores(mode: ModeId): ScoreEntry[] {
    const list = this.read<ScoreEntry[]>(`scores:${mode}`, []);
    return Array.isArray(list) ? list : [];
  }

  /** Insert a result; returns its 0-based rank, or -1 if it did not place. */
  addScore(mode: ModeId, entry: ScoreEntry): number {
    const list = [...this.scores(mode), entry].sort((a, b) => compareEntries(mode, a, b));
    const rank = list.indexOf(entry);
    if (rank >= MAX_SCORES) return -1;
    this.write(`scores:${mode}`, list.slice(0, MAX_SCORES));
    return rank;
  }

  clearScores(): void {
    for (const id of Object.keys(MODES)) this.kv.removeItem(`${PREFIX}scores:${id}`);
  }

  settings(): Settings {
    const s = this.read<Partial<Settings>>('settings', {});
    const merged: Settings = { ...DEFAULT_SETTINGS, ...s };
    merged.handling = { ...DEFAULT_SETTINGS.handling, ...(s.handling ?? {}) };
    merged.bindings = { ...DEFAULT_BINDINGS };
    for (const k of KEYS) {
      const b = s.bindings?.[k];
      if (Array.isArray(b) && b.every((c) => typeof c === 'string')) merged.bindings[k] = b;
    }
    return merged;
  }

  saveSettings(s: Settings): void {
    this.write('settings', s);
  }

  lifetime(): Lifetime {
    return { ...EMPTY_LIFETIME, ...this.read<Partial<Lifetime>>('lifetime', {}) };
  }

  recordGame(frames: number, lines: number, stats: GameStats, versus?: 'win' | 'loss'): Lifetime {
    const l = this.lifetime();
    l.games++;
    l.frames += frames;
    l.pieces += stats.pieces;
    l.lines += lines;
    l.tetrises += stats.clears[4];
    l.tspins += stats.tspins;
    l.perfectClears += stats.perfectClears;
    l.bestCombo = Math.max(l.bestCombo, stats.maxCombo);
    if (versus === 'win') l.versusWins++;
    if (versus === 'loss') l.versusLosses++;
    this.write('lifetime', l);
    return l;
  }

  bestReplay(mode: ModeId): Replay | null {
    return this.read<Replay | null>(`replay:${mode}`, null);
  }

  saveBestReplay(mode: ModeId, r: Replay): void {
    this.write(`replay:${mode}`, r);
  }

  /** Daily challenge results keyed by date string. */
  daily(date: string): ScoreEntry | null {
    return this.read<ScoreEntry | null>(`daily:${date}`, null);
  }

  saveDaily(date: string, e: ScoreEntry): boolean {
    const prev = this.daily(date);
    if (prev && compareEntries('sprint', prev, e) <= 0) return false;
    this.write(`daily:${date}`, e);
    return true;
  }
}
