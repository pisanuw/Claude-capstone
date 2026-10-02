import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_NODES, TooManyStatesError, enumerateGraph, packGraph, pathToGoal, restartGraph, unpackGraph } from '../src/core/enumerate';
import { createPuzzle } from '../src/core/factory';
import { KLOTSKI_CLASSIC, KLOTSKI_MINI, PRESETS, RUSH_HOUR_CARD_1, RUSH_HOUR_JAM } from '../src/core/presets';

describe('enumerateGraph', () => {
  it('finds all 3^n Hanoi states with the 2^n - 1 optimal solution', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const g = enumerateGraph(createPuzzle({ kind: 'hanoi', disks: n }));
      expect(g.keys.length).toBe(3 ** n);
      expect(g.optimalLength).toBe(2 ** n - 1);
      expect(g.goals.length).toBe(1);
      expect(g.deadEnds).toBe(0);
      expect(g.depth).toBe(2 ** n - 1);
    }
  });

  it('counts the sliding tile spaces and picks the farthest start', () => {
    const g23 = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 3 }));
    expect(g23.keys.length).toBe(360);
    expect(g23.optimalLength).toBe(21); // known hardest 5-puzzle position
    expect(g23.distFromStart[g23.start]).toBe(0);
    expect(g23.keys[g23.goals[0]]).toBe('123450');

    const g22 = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 2 }));
    expect(g22.keys.length).toBe(12);
    expect(g22.edgeCount).toBe(12); // a single 12-cycle
    expect(g22.optimalLength).toBe(6);
  });

  it('enumerates the whole 8-puzzle (181,440 states, hardest at 31 moves)', () => {
    const progress: number[] = [];
    const g = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 3, cols: 3 }), {
      onProgress: (n) => progress.push(n),
      progressEvery: 50_000,
    });
    expect(g.keys.length).toBe(181_440);
    expect(g.optimalLength).toBe(31);
    expect(g.maxDistToGoal).toBe(31);
    expect(progress).toEqual([50_000, 100_000, 150_000]);
  });

  it('reproduces the Klotski state count and 116-move optimum', () => {
    const g = enumerateGraph(createPuzzle(KLOTSKI_CLASSIC));
    // 13,011 with mirror reduction (25,955 states without it, the usual published count).
    expect(g.keys.length).toBe(13_011);
    expect(g.optimalLength).toBe(116);
    expect(g.goals.length).toBe(484);
    expect(g.deadEnds).toBe(0);
    const noMirror = enumerateGraph(createPuzzle({ ...KLOTSKI_CLASSIC, symmetry: 'none' }));
    expect(noMirror.keys.length).toBe(25_955);
    expect(noMirror.optimalLength).toBe(116);
  });

  it('solves the preset Rush Hour boards and mini Klotski', () => {
    expect(enumerateGraph(createPuzzle(RUSH_HOUR_CARD_1)).optimalLength).toBe(16);
    expect(enumerateGraph(createPuzzle(RUSH_HOUR_JAM)).optimalLength).toBe(12);
    expect(enumerateGraph(createPuzzle(KLOTSKI_MINI)).optimalLength).toBe(26);
  });

  it('every preset is solvable from its start', () => {
    for (const p of PRESETS) {
      if (p.id === 'tiles-3x3' || p.id === 'klotski') continue; // covered above, slow-ish
      const g = enumerateGraph(createPuzzle(p.def));
      expect(g.optimalLength, p.id).toBeGreaterThan(0);
      expect(g.distToGoal[g.goals[0]]).toBe(0);
    }
  });

  it('reports dead ends for a puzzle that cannot be solved', () => {
    const g = enumerateGraph(
      createPuzzle({ kind: 'blocks', grid: ['XXA.', 'XXA.', 'B.C.', 'BDD.'], goal: { piece: 'X', row: 2, col: 2 }, moves: 'free' }),
    );
    expect(g.goals.length).toBe(0);
    expect(g.deadEnds).toBe(g.keys.length);
    expect(g.optimalLength).toBe(-1);
    expect(pathToGoal(g, g.start)).toEqual([]);
  });

  it('stops when the space is larger than the limit', () => {
    expect(() => enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 5 }), { maxNodes: 100 })).toThrow(TooManyStatesError);
    expect(() => enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 5 }), { maxNodes: 100 })).toThrow(/More than 100/);
    expect(DEFAULT_MAX_NODES).toBeGreaterThan(181_440);
  });

  it('follows distToGoal downhill to build an optimal path', () => {
    const g = enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 3 }));
    const path = pathToGoal(g, g.start);
    expect(path).toHaveLength(8);
    expect(path[0]).toBe(g.start);
    expect(g.distToGoal[path[7]]).toBe(0);
    for (let i = 1; i < path.length; i++) {
      const nbrs = Array.from(g.adj.subarray(g.adjStart[path[i - 1]], g.adjStart[path[i]]));
      void nbrs;
      expect(g.distToGoal[path[i]]).toBe(g.distToGoal[path[i - 1]] - 1);
    }
  });

  it('can move the start and recompute layers', () => {
    const g = enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 3 }));
    const g2 = restartGraph(g, g.goals[0]);
    expect(g2.start).toBe(g.goals[0]);
    expect(g2.optimalLength).toBe(0);
    expect(g2.distFromStart[g.start]).toBe(7);
    expect(g2.depth).toBe(7);
    expect(g2.keys).toBe(g.keys); // shared, not copied
  });

  it('packs and unpacks for postMessage without losing anything', () => {
    const g = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 3 }));
    const back = unpackGraph(packGraph(g));
    expect(back.keys).toEqual(g.keys);
    expect(back.start).toBe(g.start);
    expect(back.depth).toBe(g.depth);
    expect(back.optimalLength).toBe(g.optimalLength);
    expect(back.deadEnds).toBe(0);
    expect(Array.from(back.goals)).toEqual(Array.from(g.goals));
  });
});
