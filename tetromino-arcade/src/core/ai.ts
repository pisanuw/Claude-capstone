// A placement-search CPU player. For every rotation and column of the
// current (and optionally held) piece it drops the piece, clears lines and
// scores the board with Dellacherie-style features, using the weights
// Islam El-Ashi tuned for "El-Tetris". It does not search tucks or spins.

import { cellsOf, clearLines, cloneGrid, dropY, fits, HEIGHT, place, WIDTH, type Grid, type Piece } from './board';
import type { Game } from './game';
import type { PieceType, Rotation } from './pieces';
import { Rng } from './rng';

export const WEIGHTS = {
  landingHeight: -4.500158825082766,
  rowsEliminated: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  colTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  wells: -3.3855972247263626,
};

export interface Features {
  landingHeight: number;
  rowsEliminated: number;
  rowTransitions: number;
  colTransitions: number;
  holes: number;
  wells: number;
}

export interface Placement {
  piece: Piece;
  useHold: boolean;
  value: number;
}

/** Board features after the piece `p` is placed at its landing spot. */
export function features(grid: Grid, p: Piece): Features {
  const g = cloneGrid(grid);
  place(g, p, 9);
  const pieceRows = new Map<number, number>();
  for (let y = 0; y < HEIGHT; y++) {
    const n = g[y].filter((v) => v === 9).length;
    if (n) pieceRows.set(y, n);
  }
  let landing = 0;
  for (const [y, n] of pieceRows) landing += (HEIGHT - y) * n;
  landing /= 4;

  // Count piece cells inside rows that will clear, then clear them.
  let eliminatedCells = 0;
  for (const [y, n] of pieceRows) if (g[y].every((v) => v !== 0)) eliminatedCells += n;
  const cleared = clearLines(g).length;

  let rowTransitions = 0;
  for (let y = 0; y < HEIGHT; y++) {
    if (g[y].every((v) => v === 0)) continue;
    let prev = true; // left wall
    for (let x = 0; x < WIDTH; x++) {
      const filled = g[y][x] !== 0;
      if (filled !== prev) rowTransitions++;
      prev = filled;
    }
    if (!prev) rowTransitions++; // right wall
  }

  let colTransitions = 0;
  let holes = 0;
  let wells = 0;
  for (let x = 0; x < WIDTH; x++) {
    let prev = false; // open sky above
    let seenBlock = false;
    let wellDepth = 0;
    for (let y = 0; y < HEIGHT; y++) {
      const filled = g[y][x] !== 0;
      if (filled !== prev && (seenBlock || filled)) colTransitions++;
      if (filled) seenBlock = true;
      else if (seenBlock) holes++;
      prev = filled;

      const leftFilled = x === 0 || g[y][x - 1] !== 0;
      const rightFilled = x === WIDTH - 1 || g[y][x + 1] !== 0;
      if (!filled && leftFilled && rightFilled) {
        wellDepth++;
        wells += wellDepth;
      } else {
        wellDepth = 0;
      }
    }
    if (!prev) colTransitions++; // floor
  }

  return {
    landingHeight: landing,
    rowsEliminated: cleared * eliminatedCells,
    rowTransitions,
    colTransitions,
    holes,
    wells,
  };
}

export function evaluate(f: Features): number {
  return (
    f.landingHeight * WEIGHTS.landingHeight +
    f.rowsEliminated * WEIGHTS.rowsEliminated +
    f.rowTransitions * WEIGHTS.rowTransitions +
    f.colTransitions * WEIGHTS.colTransitions +
    f.holes * WEIGHTS.holes +
    f.wells * WEIGHTS.wells
  );
}

/** Every reachable-by-hard-drop placement of `type`, best first. */
export function placements(grid: Grid, type: PieceType, startY: number, useHold = false): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<string>();
  for (let rot = 0 as Rotation; rot < 4; rot = (rot + 1) as Rotation) {
    for (let x = -3; x < WIDTH; x++) {
      const start: Piece = { type, rot, x, y: startY };
      if (!fits(grid, start)) continue;
      const piece = { ...start, y: dropY(grid, start) };
      // Symmetric shapes (O, I, S, Z) repeat placements; keep one of each.
      const key = cellsOf(piece).map((c) => c.y * WIDTH + c.x).sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ piece, useHold, value: evaluate(features(grid, piece)) });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Best placement for the game's current piece, considering hold if allowed. */
export function bestPlacements(game: Game, allowHold: boolean): Placement[] {
  if (!game.active) return [];
  const y = game.active.y;
  const all = placements(game.grid, game.active.type, y);
  if (allowHold && !game.holdUsed) {
    const alt = game.hold ?? game.next[0];
    if (alt !== game.active.type) all.push(...placements(game.grid, alt, y, true));
  }
  return all.sort((a, b) => b.value - a.value);
}

/** Hint for a human: where the current piece fits best (no hold). */
export function suggest(game: Game): Piece | null {
  return bestPlacements(game, false)[0]?.piece ?? null;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export const DIFFICULTY: Record<Difficulty, { think: number; interval: number; mistake: number; label: string }> = {
  easy: { think: 30, interval: 12, mistake: 0.3, label: 'Easy' },
  normal: { think: 14, interval: 6, mistake: 0.08, label: 'Normal' },
  hard: { think: 6, interval: 3, mistake: 0.02, label: 'Hard' },
  insane: { think: 1, interval: 1, mistake: 0, label: 'Insane' },
};

/** Drives a Game one action at a time at a human-ish pace. */
export class CpuPlayer {
  private planFor = -1;
  private plan: Placement | null = null;
  private cooldown = 0;
  private readonly rng: Rng;
  private readonly cfg: (typeof DIFFICULTY)[Difficulty];

  constructor(difficulty: Difficulty, seed: number) {
    this.cfg = DIFFICULTY[difficulty];
    this.rng = new Rng(seed ^ 0x5bd1e995);
  }

  private choose(game: Game, allowHold: boolean): Placement | null {
    const options = bestPlacements(game, allowHold);
    if (options.length === 0) return null;
    if (this.rng.next() < this.cfg.mistake) {
      return options[Math.min(options.length - 1, 1 + this.rng.int(4))];
    }
    return options[0];
  }

  /** Call once per frame before game.step(). */
  update(game: Game): void {
    if (game.over || !game.active) return;
    if (game.pieceId !== this.planFor) {
      this.planFor = game.pieceId;
      this.plan = this.choose(game, true);
      this.cooldown = this.cfg.think;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }
    this.cooldown = this.cfg.interval;
    const plan = this.plan;
    const a = game.active;
    if (!plan) {
      game.hardDrop();
      return;
    }
    if (plan.useHold) {
      game.holdPiece();
      this.planFor = game.pieceId;
      this.plan = this.choose(game, false);
      return;
    }
    if (a.rot !== plan.piece.rot) {
      const diff = (plan.piece.rot - a.rot + 4) % 4;
      if (!game.rotate(diff === 1 ? 1 : diff === 3 ? -1 : 2)) game.hardDrop();
      return;
    }
    if (a.x !== plan.piece.x) {
      if (!game.move(Math.sign(plan.piece.x - a.x))) game.hardDrop();
      return;
    }
    game.hardDrop();
  }
}
