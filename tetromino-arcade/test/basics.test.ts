import { describe, expect, it } from 'vitest';
import {
  addGarbage, clearLines, countGarbageRows, dropY, emptyGrid, fits, HEIGHT, isEmpty, stackHeight, TOP,
} from '../src/core/board';
import { boxSize, kicks, pieceCells, PIECE_TYPES } from '../src/core/pieces';
import { Bag, Rng, seedFromString } from '../src/core/rng';
import {
  attackFor, basePoints, clearLabel, gravityFor, isDifficult, scoreClear,
} from '../src/core/scoring';
import { formatTime, MODES } from '../src/core/modes';
import { bottomRows, setBottom } from './helpers';

describe('pieces', () => {
  it('every rotation of every piece has four distinct cells inside its box', () => {
    for (const t of PIECE_TYPES) {
      for (const r of [0, 1, 2, 3] as const) {
        const cells = pieceCells(t, r);
        expect(cells).toHaveLength(4);
        expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(4);
        for (const c of cells) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x).toBeLessThan(boxSize(t));
        }
      }
    }
  });

  it('rotates T clockwise into the SRS R state (nub to the right)', () => {
    expect(pieceCells('T', 1)).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]);
  });

  it('rotates I about the centre of its 4x4 box', () => {
    expect(pieceCells('I', 1).map((c) => c.x)).toEqual([2, 2, 2, 2]);
    expect(pieceCells('I', 2).map((c) => c.y)).toEqual([2, 2, 2, 2]);
  });

  it('flips published (y up) kick offsets to y down', () => {
    expect(kicks('T', 0, 1)[2]).toEqual({ x: -1, y: -1 });
    expect(kicks('I', 0, 1)[4]).toEqual({ x: 1, y: -2 });
    expect(kicks('O', 0, 1)).toEqual([{ x: 0, y: 0 }]);
    expect(kicks('S', 1, 3)).toHaveLength(6);
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(new Rng(43).next()).not.toBe(xs[0]);
    for (let i = 0; i < 100; i++) expect(a.int(7)).toBeLessThan(7);
  });

  it('7-bag deals each piece once per seven', () => {
    const bag = new Bag(7);
    for (let n = 0; n < 5; n++) {
      const seven = Array.from({ length: 7 }, () => bag.next());
      expect(new Set(seven).size).toBe(7);
    }
  });

  it('peek does not consume', () => {
    const bag = new Bag(1);
    const peeked = bag.peek(10);
    expect(Array.from({ length: 10 }, () => bag.next())).toEqual(peeked);
  });

  it('hashes strings to stable seeds', () => {
    expect(seedFromString('2026-10-27')).toBe(seedFromString('2026-10-27'));
    expect(seedFromString('2026-10-27')).not.toBe(seedFromString('2026-10-28'));
  });
});

describe('board', () => {
  it('detects walls, floor and filled cells', () => {
    const g = emptyGrid();
    expect(fits(g, { type: 'I', rot: 0, x: 0, y: 0 })).toBe(true);
    expect(fits(g, { type: 'I', rot: 0, x: 7, y: 0 })).toBe(false);
    expect(fits(g, { type: 'O', rot: 0, x: 0, y: HEIGHT - 1 })).toBe(false);
    expect(fits(g, { type: 'O', rot: 0, x: 0, y: -1 })).toBe(true);
    expect(dropY(g, { type: 'O', rot: 0, x: 4, y: 0 })).toBe(HEIGHT - 2);
  });

  it('clears full rows and shifts the rest down', () => {
    const g = emptyGrid();
    setBottom(g, ['X.........', 'XXXXXXXXXX', '.XXXXXXXXX', 'XXXXXXXXXX']);
    expect(clearLines(g)).toEqual([HEIGHT - 3, HEIGHT - 1]);
    expect(bottomRows(g, 2)).toEqual(['X.........', '.XXXXXXXXX']);
    expect(stackHeight(g)).toBe(2);
    expect(isEmpty(g)).toBe(false);
  });

  it('raises garbage with a hole and reports overflow', () => {
    const g = emptyGrid();
    expect(addGarbage(g, 2, 3)).toBe(false);
    expect(bottomRows(g, 2)).toEqual(['XXX.XXXXXX', 'XXX.XXXXXX']);
    expect(countGarbageRows(g)).toBe(2);
    g[0][0] = 1;
    expect(addGarbage(g, 1, 0)).toBe(true);
    expect(TOP).toBe(20);
  });
});

describe('scoring', () => {
  it('uses guideline line and T-spin values', () => {
    expect([0, 1, 2, 3, 4].map((n) => basePoints(n, 'none'))).toEqual([0, 100, 300, 500, 800]);
    expect(basePoints(2, 'full')).toBe(1200);
    expect(basePoints(1, 'mini')).toBe(200);
    expect(basePoints(9, 'none')).toBe(0);
    expect(isDifficult(4, 'none')).toBe(true);
    expect(isDifficult(0, 'full')).toBe(false);
  });

  it('applies level, back-to-back, combo and perfect clear bonuses', () => {
    expect(scoreClear(4, 'none', 2, 0, false, false).points).toBe(1600);
    const b2b = scoreClear(4, 'none', 1, 0, true, false);
    expect(b2b.points).toBe(1200);
    expect(b2b.b2bBonus).toBe(true);
    expect(scoreClear(1, 'none', 1, 3, false, false).points).toBe(100 + 150);
    expect(scoreClear(1, 'none', 1, 0, false, true).points).toBe(900);
    expect(scoreClear(4, 'none', 1, 0, true, true).points).toBe(1200 + 3200);
    expect(scoreClear(0, 'none', 1, 0, false, false)).toMatchObject({ points: 0, attack: 0, label: '' });
  });

  it('computes versus attack', () => {
    expect(attackFor(4, 'none', false, 0, false)).toBe(4);
    expect(attackFor(2, 'full', true, 0, false)).toBe(5);
    expect(attackFor(2, 'mini', false, 0, false)).toBe(1);
    expect(attackFor(1, 'none', false, 4, false)).toBe(1);
    expect(attackFor(1, 'none', false, 99, true)).toBe(15);
  });

  it('labels clears', () => {
    expect(clearLabel(2, 'full', true, 1, false)).toBe('Back-to-Back · T-Spin Double · 1 Combo');
    expect(clearLabel(0, 'mini', false, 0, false)).toBe('Mini T-Spin');
    expect(clearLabel(1, 'mini', false, 0, false)).toBe('Mini T-Spin Single');
    expect(clearLabel(0, 'full', false, 0, false)).toBe('T-Spin');
    expect(clearLabel(4, 'none', false, 0, true)).toBe('Tetris · Perfect Clear');
  });

  it('follows the gravity curve and caps at 20G', () => {
    expect(gravityFor(1)).toBeCloseTo(1 / 60);
    expect(gravityFor(5)).toBeGreaterThan(gravityFor(4));
    expect(gravityFor(30)).toBe(20);
  });
});

describe('modes', () => {
  it('formats frames as m:ss.mmm', () => {
    expect(formatTime(60 * 75 + 30)).toBe('1:15.500');
    expect(MODES.sprint.goalLines).toBe(40);
  });
});
