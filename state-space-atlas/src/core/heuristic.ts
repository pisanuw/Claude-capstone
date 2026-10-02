import type { StateGraph } from './enumerate';
import type { Puzzle } from './puzzle';

export type HeuristicFn = (state: unknown, puzzle: Record<string, unknown>) => number;

export interface CompiledHeuristic {
  fn: HeuristicFn;
}

export class HeuristicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeuristicError';
  }
}

/**
 * Compile the body of a student heuristic. The source is the body of a
 * function `(state, puzzle) => number`, so it should `return` a number.
 * This runs the student's own code in their own browser, which is exactly
 * what the browser console already lets them do.
 */
export function compileHeuristic(source: string): CompiledHeuristic {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new HeuristicError('The heuristic is empty; it should return a number.');
  }
  let fn: HeuristicFn;
  try {
    fn = new Function('state', 'puzzle', `"use strict";\n${source}`) as HeuristicFn;
  } catch (e) {
    throw new HeuristicError(`Syntax error: ${(e as Error).message}`);
  }
  return { fn };
}

export interface HeuristicValues {
  /** h(n) for every node. NaN where the function threw or returned a non-number. */
  values: Float64Array;
  /** Number of nodes where the function failed. */
  errors: number;
  /** First error message, if any. */
  firstError: string | null;
}

/**
 * Evaluate h on nodes [from, to). Call repeatedly with growing ranges to keep
 * the UI responsive; `into` lets the caller reuse one array.
 */
export function evaluateHeuristic(
  g: StateGraph,
  puzzle: Puzzle,
  fn: HeuristicFn,
  from = 0,
  to = g.keys.length,
  into?: HeuristicValues,
): HeuristicValues {
  const out: HeuristicValues = into ?? { values: new Float64Array(g.keys.length), errors: 0, firstError: null };
  const ctx = puzzle.context();
  for (let i = from; i < to; i++) {
    let v: unknown;
    try {
      v = fn(puzzle.decode(g.keys[i]), ctx);
    } catch (e) {
      out.errors++;
      if (out.firstError === null) out.firstError = (e as Error).message ?? String(e);
      out.values[i] = NaN;
      continue;
    }
    if (typeof v !== 'number' || Number.isNaN(v)) {
      out.errors++;
      if (out.firstError === null) out.firstError = `returned ${typeof v === 'number' ? 'NaN' : typeof v} instead of a number`;
      out.values[i] = NaN;
    } else {
      out.values[i] = v;
    }
  }
  return out;
}

export interface HeuristicReport {
  /** True when h(n) <= h*(n) for every node that can reach the goal. */
  admissible: boolean;
  /** Nodes where h overestimates the true distance (capped at `cap`). */
  overestimates: number[];
  overestimateCount: number;
  /** Largest h(n) - h*(n) over the overestimating nodes. */
  worstOverestimate: number;
  /** True when h(u) <= 1 + h(v) for every edge (u, v). */
  consistent: boolean;
  /** Edges [u, v] that violate consistency (capped at `cap`). */
  inconsistentEdges: Array<[number, number]>;
  inconsistentCount: number;
  /** True when every goal has h = 0 (part of the usual definition of a heuristic). */
  zeroAtGoal: boolean;
  /** Mean of h(n) / h*(n) over nodes with h*(n) > 0: 1.0 would be a perfect heuristic. */
  informedness: number;
  maxH: number;
  /** Nodes where h could not be evaluated. */
  errors: number;
  firstError: string | null;
}

/**
 * Check a heuristic against the true distances the atlas knows. Nodes that
 * cannot reach the goal are skipped for admissibility (any finite value is
 * fine there) but still take part in the consistency check.
 */
export function checkHeuristic(g: StateGraph, hv: HeuristicValues, cap = 2000): HeuristicReport {
  const h = hv.values;
  const n = g.keys.length;
  const overestimates: number[] = [];
  let overestimateCount = 0;
  let worst = 0;
  let maxH = 0;
  let ratioSum = 0;
  let ratioCount = 0;
  let zeroAtGoal = true;
  for (let i = 0; i < n; i++) {
    const v = h[i];
    if (Number.isNaN(v)) continue;
    if (v > maxH) maxH = v;
    const d = g.distToGoal[i];
    if (d === 0 && v !== 0) zeroAtGoal = false;
    if (d < 0) continue;
    if (v > d + 1e-9) {
      overestimateCount++;
      if (v - d > worst) worst = v - d;
      if (overestimates.length < cap) overestimates.push(i);
    }
    if (d > 0) {
      ratioSum += Math.min(v, d) / d;
      ratioCount++;
    }
  }
  const inconsistentEdges: Array<[number, number]> = [];
  let inconsistentCount = 0;
  for (let u = 0; u < n; u++) {
    const hu = h[u];
    if (Number.isNaN(hu)) continue;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
      const v = g.adj[k];
      const hvv = h[v];
      if (Number.isNaN(hvv)) continue;
      if (hu > 1 + hvv + 1e-9) {
        inconsistentCount++;
        if (inconsistentEdges.length < cap) inconsistentEdges.push([u, v]);
      }
    }
  }
  return {
    admissible: overestimateCount === 0 && hv.errors === 0,
    overestimates,
    overestimateCount,
    worstOverestimate: worst,
    consistent: inconsistentCount === 0 && hv.errors === 0,
    inconsistentEdges,
    inconsistentCount,
    zeroAtGoal,
    informedness: ratioCount ? ratioSum / ratioCount : 1,
    maxH,
    errors: hv.errors,
    firstError: hv.firstError,
  };
}

/** Wrap evaluated values as a node-indexed heuristic for the search, treating failures as 0. */
export function heuristicFromValues(hv: HeuristicValues): (node: number) => number {
  return (i) => {
    const v = hv.values[i];
    return Number.isNaN(v) ? 0 : v;
  };
}

export interface HeuristicPreset {
  id: string;
  name: string;
  kind: 'hanoi' | 'tiles' | 'blocks' | 'any';
  source: string;
}

export const HEURISTIC_PRESETS: HeuristicPreset[] = [
  {
    id: 'zero',
    name: 'Zero (turns A* into BFS)',
    kind: 'any',
    source: '// h = 0 is admissible and consistent, and tells the search nothing.\nreturn 0;',
  },
  {
    id: 'tiles-misplaced',
    name: 'Misplaced tiles',
    kind: 'tiles',
    source: `// Count the tiles that are not where they belong. The blank does not count.
let misplaced = 0;
for (let r = 0; r < state.rows; r++) {
  for (let c = 0; c < state.cols; c++) {
    const t = state.tiles[r][c];
    if (t !== 0 && (state.goalRow[t] !== r || state.goalCol[t] !== c)) misplaced++;
  }
}
return misplaced;`,
  },
  {
    id: 'tiles-manhattan',
    name: 'Manhattan distance',
    kind: 'tiles',
    source: `// Sum over tiles of |row - goalRow| + |col - goalCol|. Each move slides one
// tile one step, so this never overestimates.
let sum = 0;
for (let r = 0; r < state.rows; r++) {
  for (let c = 0; c < state.cols; c++) {
    const t = state.tiles[r][c];
    if (t === 0) continue;
    sum += Math.abs(r - state.goalRow[t]) + Math.abs(c - state.goalCol[t]);
  }
}
return sum;`,
  },
  {
    id: 'tiles-manhattan-x2',
    name: 'Manhattan x 2 (inadmissible on purpose)',
    kind: 'tiles',
    source: `// Doubling Manhattan makes A* expand far fewer nodes, but the checker will
// show the states where it overestimates, and the path it finds can be longer
// than optimal.
let sum = 0;
for (let r = 0; r < state.rows; r++) {
  for (let c = 0; c < state.cols; c++) {
    const t = state.tiles[r][c];
    if (t === 0) continue;
    sum += Math.abs(r - state.goalRow[t]) + Math.abs(c - state.goalCol[t]);
  }
}
return 2 * sum;`,
  },
  {
    id: 'hanoi-not-home',
    name: 'Disks not on the goal peg',
    kind: 'hanoi',
    source: `// Every disk that is not on the goal peg has to move at least once.
let count = 0;
for (const peg of state.on) if (peg !== puzzle.goalPeg) count++;
return count;`,
  },
  {
    id: 'hanoi-largest',
    name: 'Largest misplaced disk (admissible, not consistent)',
    kind: 'hanoi',
    source: `// Let k be the largest disk not on the goal peg (disks are numbered from 0,
// smallest first). When it finally lands, every smaller disk sits on the third
// peg and still needs 2^k - 1 moves, so h = 2^k never overestimates. It is not
// consistent: h can drop from 2^k to 2^(k-1) along a single edge, so watch A*
// reopen nodes.
let largest = -1;
for (let d = 0; d < state.disks; d++) if (state.on[d] !== puzzle.goalPeg) largest = d;
return largest < 0 ? 0 : Math.pow(2, largest);`,
  },
  {
    id: 'blocks-goal-distance',
    name: 'Goal piece Manhattan distance',
    kind: 'blocks',
    source: `// Each move slides one piece one cell, so the goal piece alone needs at
// least this many moves.
const p = state.goalPiece;
return Math.abs(p.row - state.goal.row) + Math.abs(p.col - state.goal.col);`,
  },
  {
    id: 'blocks-goal-plus-blockers',
    name: 'Goal distance + pieces in the way',
    kind: 'blocks',
    source: `// Pieces sitting on the goal footprint each have to move at least once,
// and those moves are separate from the goal piece's own moves.
const p = state.goalPiece;
const dist = Math.abs(p.row - state.goal.row) + Math.abs(p.col - state.goal.col);
let blockers = 0;
for (const q of state.pieces) {
  if (q.goal) continue;
  const overlapsRows = q.row < state.goal.row + p.h && q.row + q.h > state.goal.row;
  const overlapsCols = q.col < state.goal.col + p.w && q.col + q.w > state.goal.col;
  if (overlapsRows && overlapsCols) blockers++;
}
return dist + blockers;`,
  },
];

export function presetsFor(kind: 'hanoi' | 'tiles' | 'blocks'): HeuristicPreset[] {
  return HEURISTIC_PRESETS.filter((p) => p.kind === 'any' || p.kind === kind);
}
