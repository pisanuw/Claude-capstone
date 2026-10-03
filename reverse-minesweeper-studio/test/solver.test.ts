import { describe, expect, it } from 'vitest';
import { type Board, neighbors, numbers } from '../src/core/board';
import { PRESETS, boardFromRows, randomBoard } from '../src/core/presets';
import { decodeBoard } from '../src/core/share';
import { FLAGGED, REVEALED, components, difficulty, enumerate, solve, validCounts } from '../src/core/solver';
import { bestStart } from '../src/core/suggest';

// Boards found by a seeded search, pinned so each tier has a witness.
const NEEDS_SEARCH = 'v1.8x8.4.AEQIQQCgAQc';
const NEEDS_COUNT = 'v1.8x8.0.FHCoAAAAUCI';
const FIFTY_FIFTY = 'v1.8x8.3.AILoAU0pCAI';

function preset(id: string): Board {
  const b = boardFromRows(PRESETS.find((p) => p.id === id)!.rows);
  b.start = bestStart(b);
  return b;
}

describe('solve', () => {
  it('refuses boards that are not ready', () => {
    const b = boardFromRows(['....', '....', '....', '....']);
    expect(() => solve(b)).toThrow(/starting cell/);
  });

  it('opens the whole board on a trivial drawing', () => {
    const r = solve(preset('arrow'));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(0);
    expect(difficulty(r).label).toBe('Trivial');
    expect(r.ambiguity).toBeNull();
  });

  it('solves letters with single-cell rules only', () => {
    const r = solve(preset('hi'));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(1);
    expect(difficulty(r).label).toBe('Beginner logic');
  });

  it('spells İdil with a guess-free board', () => {
    const r = solve(preset('idil'));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBeLessThanOrEqual(2);
  });

  it('needs pairwise reasoning for the heart', () => {
    const r = solve(preset('heart'));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(2);
    expect(r.decidedByTier[2]).toBeGreaterThan(0);
  });

  it('falls back to frontier search when pairs are not enough', () => {
    const r = solve(decodeBoard(NEEDS_SEARCH));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(3);
    expect(difficulty(r).label).toBe('Expert');
  });

  it('uses the global mine count as a last resort', () => {
    const r = solve(decodeBoard(NEEDS_COUNT));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(4);
  });

  it('clears a sealed box only by counting mines', () => {
    const r = solve(preset('box'));
    expect(r.solved).toBe(true);
    expect(r.maxTier).toBe(4);
    expect(difficulty(r).label).toBe('Needs mine count');
  });

  it('reports sealed cells when a hidden mine makes counting useless', () => {
    const r = solve(preset('trap'));
    expect(r.solved).toBe(false);
    expect(r.sealed.length).toBeGreaterThan(0);
    expect(r.stuck).toEqual([]);
    expect(r.ambiguity).toBeNull();
  });

  it('shows two competing layouts for the smallest ambiguous region', () => {
    const b = decodeBoard(FIFTY_FIFTY);
    const r = solve(b);
    expect(r.solved).toBe(false);
    expect(r.ambiguity!.cells).toEqual([7, 15]);
    expect(r.ambiguity!.layouts).toHaveLength(2);
    expect(r.stuck).toEqual(expect.arrayContaining([7, 15]));
    // Both layouts must agree with every visible number.
    const nums = numbers(b);
    for (const layout of r.ambiguity!.layouts) {
      const mines = b.mines.slice();
      for (const c of r.ambiguity!.cells) mines[c] = layout.includes(c);
      r.state.forEach((s, i) => {
        if (s !== REVEALED) return;
        expect(neighbors(b, i).filter((j) => mines[j]).length).toBe(nums[i]);
      });
    }
  });

  it('records steps that replay to the final state', () => {
    const r = solve(preset('heart'));
    const state = new Array<number>(r.state.length).fill(0);
    for (const s of r.steps) {
      s.revealed.forEach((i) => (state[i] = REVEALED));
      s.flagged.forEach((i) => (state[i] = FLAGGED));
    }
    expect(state).toEqual(r.state);
    expect(r.steps[0]!.tier).toBe(0);
  });

  it('never opens a mine or flags a safe cell on random boards', () => {
    // solve() throws on either mistake, so this is a soundness sweep.
    let solved = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const b = randomBoard(10, 8, 0.12 + (seed % 5) * 0.04, seed);
      b.start = b.mines.findIndex((m) => !m);
      if (b.start < 0 || b.mines.every((m) => !m)) continue;
      const r = solve(b);
      r.state.forEach((s, i) => {
        if (s === REVEALED) expect(b.mines[i]).toBe(false);
        if (s === FLAGGED) expect(b.mines[i]).toBe(true);
      });
      if (r.solved) solved++;
    }
    expect(solved).toBeGreaterThan(10);
  });

  it('marks the search as aborted when the budget is exhausted', () => {
    const b = decodeBoard(NEEDS_SEARCH);
    const r = solve(b, { searchLimit: 1 });
    expect(r.aborted).toBe(true);
    expect(r.solved).toBe(false);
  });
});

describe('search helpers', () => {
  it('groups frontier cells linked by shared numbers', () => {
    const groups = components([
      { cells: [1, 2], count: 1 },
      { cells: [2, 3], count: 1 },
      { cells: [9], count: 1 },
    ]);
    expect(groups.map((g) => g.cells)).toEqual([[1, 2, 3], [9]]);
    expect(groups[0]!.constraints).toHaveLength(2);
  });

  it('enumerates every consistent layout', () => {
    const { search } = enumerate([1, 2, 3], [{ cells: [1, 2], count: 1 }, { cells: [2, 3], count: 1 }], 1000);
    // Layouts: {2} (one mine) and {1,3} (two mines).
    expect(search.layouts.get(1)).toBe(1);
    expect(search.layouts.get(2)).toBe(1);
    expect(search.tally.get(2)).toEqual([1, 0, 1]);
  });

  it('filters per-component mine counts by the global total', () => {
    const comps = [{ layouts: new Map([[1, 1], [2, 1]]) }, { layouts: new Map([[1, 2]]) }];
    expect(validCounts(comps, 2, 0)).toEqual({ perComponent: [[1], [1]], interiorCounts: [0] });
    expect(validCounts(comps, 4, 1).perComponent).toEqual([[2], [1]]);
    expect(validCounts(comps, 3, 5).interiorCounts).toEqual([0, 1]);
  });
});
