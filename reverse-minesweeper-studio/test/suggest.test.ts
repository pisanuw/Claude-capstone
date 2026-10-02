import { describe, expect, it } from 'vitest';
import { createBoard } from '../src/core/board';
import { PRESETS, boardFromRows } from '../src/core/presets';
import { decodeBoard } from '../src/core/share';
import { solve } from '../src/core/solver';
import { bestStart, suggestEdits } from '../src/core/suggest';

describe('bestStart', () => {
  it('picks a safe opening that solves the heart', () => {
    const b = boardFromRows(PRESETS[0]!.rows);
    b.start = bestStart(b);
    expect(b.mines[b.start]).toBe(false);
    expect(solve(b).solved).toBe(true);
  });

  it('returns -1 when every cell is a mine', () => {
    const b = createBoard(4, 4);
    b.mines.fill(true);
    expect(bestStart(b)).toBe(-1);
  });

  it('falls back to numbered cells when no zero exists', () => {
    const b = createBoard(4, 4);
    b.mines = b.mines.map((_, i) => i % 2 === 0);
    const s = bestStart(b);
    expect(b.mines[s]).toBe(false);
  });
});

describe('suggestEdits', () => {
  it('returns nothing for solved or unready boards', () => {
    const b = boardFromRows(PRESETS[0]!.rows);
    expect(suggestEdits(b)).toEqual([]);
    b.start = bestStart(b);
    expect(suggestEdits(b)).toEqual([]);
  });

  it('finds a single edit that opens a sealed trap', () => {
    const b = boardFromRows(PRESETS.find((p) => p.id === 'trap')!.rows);
    b.start = bestStart(b);
    const fixes = suggestEdits(b);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]!.result.solved).toBe(true);
    const fixed = { ...b, mines: b.mines.slice() };
    fixed.mines[fixes[0]!.cell] = fixes[0]!.addMine;
    expect(solve(fixed).solved).toBe(true);
  });

  it('only proposes edits that make progress, best first, never on the start', () => {
    const b = decodeBoard('v1.8x8.3.AILoAU0pCAI');
    const base = solve(b).state.filter((s) => s === 1).length;
    const fixes = suggestEdits(b, 5);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) expect(f.result.solved || f.result.revealed > base).toBe(true);
    for (let k = 1; k < fixes.length; k++) {
      expect(fixes[k - 1]!.result.revealed).toBeGreaterThanOrEqual(fixes[k]!.result.revealed);
    }
    expect(fixes.some((f) => f.cell === b.start)).toBe(false);
  });
});
