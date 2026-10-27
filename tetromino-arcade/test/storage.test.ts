import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { Session } from '../src/core/session';
import {
  browserKV, compareEntries, DEFAULT_SETTINGS, MAX_SCORES, MemoryKV, Records, type ScoreEntry,
} from '../src/core/storage';

const entry = (over: Partial<ScoreEntry>): ScoreEntry => ({
  name: 'P', score: 0, lines: 0, frames: 0, level: 1, won: false, date: '2026-10-27', ...over,
});

describe('Records', () => {
  it('ranks score modes by score and keeps the top ten', () => {
    const r = new Records(new MemoryKV());
    for (let i = 0; i < 12; i++) r.addScore('marathon', entry({ score: i * 100 }));
    const list = r.scores('marathon');
    expect(list).toHaveLength(MAX_SCORES);
    expect(list[0].score).toBe(1100);
    expect(r.addScore('marathon', entry({ score: 1 }))).toBe(-1);
    expect(r.addScore('marathon', entry({ score: 5000 }))).toBe(0);
    r.clearScores();
    expect(r.scores('marathon')).toEqual([]);
  });

  it('ranks time modes by finished first, then time, then lines', () => {
    expect(compareEntries('sprint', entry({ won: true, frames: 100 }), entry({ won: true, frames: 200 }))).toBeLessThan(0);
    expect(compareEntries('sprint', entry({ won: false }), entry({ won: true }))).toBeGreaterThan(0);
    expect(compareEntries('sprint', entry({ won: true }), entry({ won: false }))).toBeLessThan(0);
    expect(compareEntries('dig', entry({ lines: 5 }), entry({ lines: 9 }))).toBeGreaterThan(0);
  });

  it('merges stored settings over defaults and ignores bad bindings', () => {
    const kv = new MemoryKV();
    const r = new Records(kv);
    expect(r.settings()).toEqual(DEFAULT_SETTINGS);
    r.saveSettings({ ...DEFAULT_SETTINGS, ghost: false, handling: { das: 7, arr: 0, sdf: 41 } });
    kv.setItem('tetromino-arcade:settings', JSON.stringify({
      ...JSON.parse(kv.getItem('tetromino-arcade:settings')!),
      bindings: { left: ['KeyJ'], right: 5 },
    }));
    const s = r.settings();
    expect(s.ghost).toBe(false);
    expect(s.handling.das).toBe(7);
    expect(s.bindings.left).toEqual(['KeyJ']);
    expect(s.bindings.right).toEqual(['ArrowRight']);
  });

  it('survives corrupt JSON and failing writes', () => {
    const kv = new MemoryKV();
    kv.setItem('tetromino-arcade:scores:zen', '{not json');
    kv.setItem('tetromino-arcade:scores:ultra', '{"a":1}');
    const r = new Records(kv);
    expect(r.scores('zen')).toEqual([]);
    expect(r.scores('ultra')).toEqual([]);
    const broken = new Records({
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => undefined,
    });
    expect(broken.addScore('zen', entry({ score: 5 }))).toBe(0);
  });

  it('accumulates lifetime stats', () => {
    const r = new Records(new MemoryKV());
    const g = new Game({ mode: 'versus', seed: 1 });
    g.hardDrop();
    r.recordGame(600, 4, g.stats, 'win');
    const l = r.recordGame(60, 0, g.stats, 'loss');
    expect(l).toMatchObject({ games: 2, frames: 660, lines: 4, pieces: 2, versusWins: 1, versusLosses: 1 });
    r.recordGame(1, 0, g.stats);
    expect(r.lifetime().games).toBe(3);
  });

  it('stores best replays and daily bests', () => {
    const r = new Records(new MemoryKV());
    expect(r.bestReplay('sprint')).toBeNull();
    const rep = new Session({ mode: 'sprint', seed: 1 }).toReplay();
    r.saveBestReplay('sprint', rep);
    expect(r.bestReplay('sprint')?.seed).toBe(1);
    expect(r.daily('2026-10-27')).toBeNull();
    expect(r.saveDaily('2026-10-27', entry({ won: true, frames: 500 }))).toBe(true);
    expect(r.saveDaily('2026-10-27', entry({ won: true, frames: 900 }))).toBe(false);
    expect(r.saveDaily('2026-10-27', entry({ won: true, frames: 300 }))).toBe(true);
    expect(r.daily('2026-10-27')?.frames).toBe(300);
  });

  it('falls back to memory when localStorage is unavailable', () => {
    const kv = browserKV();
    kv.setItem('x', '1');
    expect(kv.getItem('x')).toBe('1');
    kv.removeItem('x');
    expect(kv.getItem('x')).toBeNull();
  });
});
