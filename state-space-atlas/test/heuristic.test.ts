import { describe, expect, it } from 'vitest';
import { enumerateGraph } from '../src/core/enumerate';
import { createPuzzle } from '../src/core/factory';
import {
  HEURISTIC_PRESETS,
  HeuristicError,
  checkHeuristic,
  compileHeuristic,
  evaluateHeuristic,
  heuristicFromValues,
  presetsFor,
} from '../src/core/heuristic';
import { KLOTSKI_CLASSIC, RUSH_HOUR_JAM } from '../src/core/presets';

const tilesDef = { kind: 'tiles' as const, rows: 2, cols: 4 };
const tiles = createPuzzle(tilesDef);
const tilesGraph = enumerateGraph(tiles);
const hanoi = createPuzzle({ kind: 'hanoi', disks: 5 });
const hanoiGraph = enumerateGraph(hanoi);

function report(id: string, puzzle = tiles, g = tilesGraph) {
  const src = HEURISTIC_PRESETS.find((p) => p.id === id)!.source;
  return checkHeuristic(g, evaluateHeuristic(g, puzzle, compileHeuristic(src).fn));
}

describe('compileHeuristic', () => {
  it('compiles a function body and rejects empty or broken sources', () => {
    const { fn } = compileHeuristic('return 3;');
    expect(fn({}, {})).toBe(3);
    expect(() => compileHeuristic('')).toThrow(HeuristicError);
    expect(() => compileHeuristic('return (;')).toThrow(/Syntax error/);
  });
});

describe('evaluateHeuristic', () => {
  it('records runtime errors and non-numeric returns per node without aborting', () => {
    const hv = evaluateHeuristic(tilesGraph, tiles, compileHeuristic('if (state.blank.row === 0) throw new Error("boom"); return "x";').fn);
    expect(hv.errors).toBe(tilesGraph.keys.length);
    expect(hv.firstError).toMatch(/boom|returned string/);
    expect(Number.isNaN(hv.values[0])).toBe(true);
    const h = heuristicFromValues(hv);
    expect(h(0)).toBe(0);
    const nan = evaluateHeuristic(tilesGraph, tiles, compileHeuristic('return NaN;').fn, 0, 3);
    expect(nan.errors).toBe(3);
    expect(nan.firstError).toBe('returned NaN instead of a number');
  });

  it('can be evaluated in ranges that share one result object', () => {
    const fn = compileHeuristic('return 1;').fn;
    const hv = evaluateHeuristic(tilesGraph, tiles, fn, 0, 10);
    expect(hv.values[9]).toBe(1);
    expect(hv.values[10]).toBe(0); // untouched so far
    evaluateHeuristic(tilesGraph, tiles, fn, 10, tilesGraph.keys.length, hv);
    expect(hv.values[tilesGraph.keys.length - 1]).toBe(1);
    expect(hv.errors).toBe(0);
  });
});

describe('checkHeuristic', () => {
  it('certifies Manhattan and misplaced tiles as admissible and consistent', () => {
    for (const id of ['tiles-manhattan', 'tiles-misplaced', 'zero']) {
      const r = report(id);
      expect(r.admissible, id).toBe(true);
      expect(r.consistent, id).toBe(true);
      expect(r.zeroAtGoal, id).toBe(true);
      expect(r.overestimateCount, id).toBe(0);
      expect(r.inconsistentCount, id).toBe(0);
    }
    const manhattan = report('tiles-manhattan');
    const misplaced = report('tiles-misplaced');
    expect(manhattan.informedness).toBeGreaterThan(misplaced.informedness);
    expect(manhattan.informedness).toBeLessThanOrEqual(1);
    expect(report('zero').informedness).toBe(0);
    expect(manhattan.maxH).toBeGreaterThan(0);
  });

  it('catches the doubled Manhattan heuristic overestimating', () => {
    const r = report('tiles-manhattan-x2');
    expect(r.admissible).toBe(false);
    expect(r.overestimateCount).toBeGreaterThan(0);
    expect(r.overestimates.length).toBeGreaterThan(0);
    expect(r.overestimates.length).toBeLessThanOrEqual(2000);
    expect(r.worstOverestimate).toBeGreaterThan(0);
    expect(r.consistent).toBe(false);
    expect(r.inconsistentCount).toBeGreaterThan(0);
    // Every reported node really overestimates.
    const hv = evaluateHeuristic(tilesGraph, tiles, compileHeuristic(HEURISTIC_PRESETS.find((p) => p.id === 'tiles-manhattan-x2')!.source).fn);
    for (const i of r.overestimates.slice(0, 50)) expect(hv.values[i]).toBeGreaterThan(tilesGraph.distToGoal[i]);
  });

  it('respects the cap on reported violations', () => {
    const hv = evaluateHeuristic(tilesGraph, tiles, compileHeuristic('return 1000;').fn);
    const r = checkHeuristic(tilesGraph, hv, 10);
    expect(r.overestimates).toHaveLength(10);
    expect(r.overestimateCount).toBe(tilesGraph.keys.length); // the goal overestimates too (h* = 0)
    expect(r.inconsistentEdges).toHaveLength(0); // constant h is consistent
    expect(r.zeroAtGoal).toBe(false);
  });

  it('flags an inconsistent but admissible heuristic', () => {
    // h = true distance on even-indexed nodes, 0 elsewhere: never overestimates, but jumps by more than 1.
    const hv = { values: Float64Array.from(tilesGraph.distToGoal, (d, i) => (i % 2 === 0 ? d : 0)), errors: 0, firstError: null };
    const r = checkHeuristic(tilesGraph, hv, 5);
    expect(r.admissible).toBe(true);
    expect(r.consistent).toBe(false);
    expect(r.inconsistentEdges).toHaveLength(5);
    for (const [u, v] of r.inconsistentEdges) expect(hv.values[u]).toBeGreaterThan(1 + hv.values[v]);
  });

  it('marks a heuristic with evaluation errors as neither admissible nor consistent', () => {
    const hv = evaluateHeuristic(tilesGraph, tiles, compileHeuristic('return state.nope.x;').fn);
    const r = checkHeuristic(tilesGraph, hv);
    expect(r.errors).toBe(tilesGraph.keys.length);
    expect(r.admissible).toBe(false);
    expect(r.consistent).toBe(false);
    expect(r.firstError).toMatch(/undefined/);
  });

  it('skips dead-end nodes for admissibility', () => {
    const dead = enumerateGraph(createPuzzle({ kind: 'blocks', grid: ['XXA.', 'XXA.', 'B.C.', 'BDD.'], goal: { piece: 'X', row: 2, col: 2 }, moves: 'free' }));
    const hv = { values: new Float64Array(dead.keys.length).fill(99), errors: 0, firstError: null };
    const r = checkHeuristic(dead, hv);
    expect(r.admissible).toBe(true);
    expect(r.informedness).toBe(1);
  });

  it('certifies the Hanoi and block presets as admissible and consistent', () => {
    const notHome = report('hanoi-not-home', hanoi, hanoiGraph);
    expect(notHome.admissible).toBe(true);
    expect(notHome.consistent).toBe(true);
    // 2^k drops by more than 1 when the largest misplaced disk lands: admissible but inconsistent.
    const largest = report('hanoi-largest', hanoi, hanoiGraph);
    expect(largest.admissible).toBe(true);
    expect(largest.consistent).toBe(false);
    expect(largest.inconsistentCount).toBeGreaterThan(0);
    expect(report('hanoi-largest', hanoi, hanoiGraph).informedness).toBeGreaterThan(report('hanoi-not-home', hanoi, hanoiGraph).informedness);

    const klotski = createPuzzle(KLOTSKI_CLASSIC);
    const kg = enumerateGraph(klotski);
    const rush = createPuzzle(RUSH_HOUR_JAM);
    const rg = enumerateGraph(rush);
    for (const id of ['blocks-goal-distance', 'blocks-goal-plus-blockers']) {
      for (const [p, g] of [
        [klotski, kg],
        [rush, rg],
      ] as const) {
        const r = report(id, p, g);
        expect(r.admissible, `${id} ${p.label}`).toBe(true);
        expect(r.consistent, `${id} ${p.label}`).toBe(true);
      }
    }
  });
});

describe('presets', () => {
  it('offers the right presets per puzzle kind', () => {
    expect(presetsFor('tiles').map((p) => p.id)).toEqual(['zero', 'tiles-misplaced', 'tiles-manhattan', 'tiles-manhattan-x2']);
    expect(presetsFor('hanoi').map((p) => p.id)).toEqual(['zero', 'hanoi-not-home', 'hanoi-largest']);
    expect(presetsFor('blocks').map((p) => p.id)).toEqual(['zero', 'blocks-goal-distance', 'blocks-goal-plus-blockers']);
    for (const p of HEURISTIC_PRESETS) expect(() => compileHeuristic(p.source)).not.toThrow();
  });
});
