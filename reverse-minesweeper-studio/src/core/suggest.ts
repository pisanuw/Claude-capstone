import { type Board, boardProblem, cellCount, cloneBoard, coords, numbers } from './board';
import { type SolveResult, type Tier, REVEALED, solve } from './solver';

export interface Evaluation {
  solved: boolean;
  revealed: number;
  maxTier: Tier;
}

function evaluate(result: SolveResult): Evaluation {
  return {
    solved: result.solved,
    revealed: result.state.filter((s) => s === REVEALED).length,
    maxTier: result.maxTier,
  };
}

/** Solved beats unsolved, then more cells uncovered, then easier logic. */
function better(a: Evaluation, b: Evaluation): number {
  if (a.solved !== b.solved) return a.solved ? -1 : 1;
  if (a.revealed !== b.revealed) return b.revealed - a.revealed;
  return a.maxTier - b.maxTier;
}

/**
 * Pick the opening cell that gets the solver furthest. Openings on a zero are
 * tried first (they are what a real first click looks like); up to `limit`
 * candidates are sampled evenly across the board.
 */
export function bestStart(board: Board, limit = 80): number {
  const nums = numbers(board);
  const safe: number[] = [];
  for (let i = 0; i < cellCount(board); i++) if (!board.mines[i]) safe.push(i);
  const zeros = safe.filter((i) => nums[i] === 0);
  const pool = zeros.length ? zeros : safe;
  if (!pool.length) return -1;
  const stride = Math.max(1, Math.floor(pool.length / limit));
  let best = -1;
  let bestEval: Evaluation | null = null;
  for (let k = 0; k < pool.length; k += stride) {
    const trial = cloneBoard(board);
    trial.start = pool[k]!;
    const e = evaluate(solve(trial));
    if (!bestEval || better(e, bestEval) < 0) {
      best = pool[k]!;
      bestEval = e;
      if (e.solved && e.maxTier <= 1) break;
    }
  }
  return best;
}

export interface Suggestion {
  cell: number;
  /** True when the fix adds a mine at `cell`, false when it removes one. */
  addMine: boolean;
  result: Evaluation;
}

/**
 * Single-cell edits (toggle one mine) near where the solver got stuck, ranked
 * by how far they get the solver. Returns an empty list for a solved board.
 */
export function suggestEdits(board: Board, limit = 3, radius = 2): Suggestion[] {
  if (boardProblem(board)) return [];
  const base = solve(board);
  if (base.solved) return [];
  const baseEval = evaluate(base);
  const focus = base.stuck.length ? base.stuck : base.sealed;
  const candidates = new Set<number>();
  for (const f of focus) {
    const [fx, fy] = coords(board, f);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = fx + dx;
        const y = fy + dy;
        if (x >= 0 && y >= 0 && x < board.width && y < board.height) candidates.add(y * board.width + x);
      }
    }
  }
  candidates.delete(board.start);
  const out: Suggestion[] = [];
  for (const cell of [...candidates].sort((a, b) => a - b)) {
    const trial = cloneBoard(board);
    trial.mines[cell] = !trial.mines[cell];
    if (boardProblem(trial)) continue;
    const e = evaluate(solve(trial));
    if (!e.solved && e.revealed <= baseEval.revealed) continue;
    out.push({ cell, addMine: trial.mines[cell]!, result: e });
  }
  out.sort((a, b) => better(a.result, b.result) || a.cell - b.cell);
  return out.slice(0, limit);
}
