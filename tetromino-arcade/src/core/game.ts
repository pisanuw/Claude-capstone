// The rules engine. A Game advances in fixed 1/60 s frames and is fully
// deterministic for a given seed and input sequence, which is what makes
// replays and the versus CPU reproducible.

import {
  addGarbage,
  blocked,
  cellsOf,
  clearLines,
  countGarbageRows,
  dropY,
  emptyGrid,
  fits,
  isEmpty,
  place,
  TOP,
  WIDTH,
  type Grid,
  type Piece,
} from './board';
import { MODES, type ModeDef, type ModeId } from './modes';
import { boxSize, kicks, PIECE_ID, type PieceType, type Rotation } from './pieces';
import { Bag, Rng } from './rng';
import { gravityFor, isDifficult, scoreClear, type Spin } from './scoring';

export const NEXT_COUNT = 5;
export const LOCK_DELAY = 30;
export const MAX_LOCK_RESETS = 15;
/** Soft drop factor at or above this means "drop to the floor instantly". */
export const INSTANT_SDF = 41;

export type GameEvent =
  | { type: 'spawn'; piece: PieceType }
  | { type: 'move' }
  | { type: 'rotate'; spin: boolean }
  | { type: 'hold' }
  | { type: 'harddrop'; distance: number; cells: { x: number; y: number }[] }
  | { type: 'lock'; lines: number[]; spin: Spin; label: string; points: number; combo: number; b2b: boolean; perfect: boolean; attack: number }
  | { type: 'levelup'; level: number }
  | { type: 'garbage'; rows: number }
  | { type: 'zenreset' }
  | { type: 'end'; won: boolean; reason: string };

export interface GameOptions {
  mode: ModeId;
  seed: number;
  startLevel?: number;
  /** Soft drop factor (multiplier on gravity); >= INSTANT_SDF drops instantly. */
  sdf?: number;
}

export interface GameStats {
  pieces: number;
  inputs: number;
  holds: number;
  clears: [number, number, number, number, number];
  tspins: number;
  perfectClears: number;
  maxCombo: number;
  maxB2B: number;
  attackSent: number;
  garbageReceived: number;
  zenResets: number;
}

export class Game {
  readonly mode: ModeDef;
  readonly seed: number;
  readonly startLevel: number;
  sdf: number;

  grid: Grid = emptyGrid();
  active: Piece | null = null;
  hold: PieceType | null = null;
  holdUsed = false;
  /** Increments each time a new piece enters, so observers can tell pieces apart. */
  pieceId = 0;

  score = 0;
  lines = 0;
  level: number;
  /** -1 means no combo in progress. */
  combo = -1;
  /** Consecutive difficult clears; > 0 means the next difficult clear gets a bonus. */
  b2b = 0;
  frame = 0;
  over = false;
  won = false;
  endReason = '';
  /** Garbage rows still to dig (dig mode). */
  garbageLeft = 0;

  /** Incoming garbage batches waiting to rise (versus). */
  pending: number[] = [];
  /** Attack produced since the last drainAttack(). */
  private outgoing = 0;

  stats: GameStats = {
    pieces: 0, inputs: 0, holds: 0, clears: [0, 0, 0, 0, 0], tspins: 0, perfectClears: 0,
    maxCombo: 0, maxB2B: 0, attackSent: 0, garbageReceived: 0, zenResets: 0,
  };

  events: GameEvent[] = [];

  private readonly bag: Bag;
  private readonly garbageRng: Rng;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastWasRotation = false;
  private lastKick = 0;

  constructor(opts: GameOptions) {
    this.mode = MODES[opts.mode];
    this.seed = opts.seed >>> 0;
    this.startLevel = Math.min(20, Math.max(1, opts.startLevel ?? 1));
    this.level = this.mode.fixedLevel ?? this.startLevel;
    this.sdf = opts.sdf ?? 20;
    this.bag = new Bag(this.seed);
    this.garbageRng = new Rng(this.seed ^ 0x9e3779b9);
    if (this.mode.startGarbage) this.addCheese(this.mode.startGarbage);
    this.spawn(this.bag.next());
  }

  // ---- Queries -------------------------------------------------------------

  get next(): PieceType[] {
    return this.bag.peek(NEXT_COUNT);
  }

  /** Where the active piece would land. */
  ghost(): Piece | null {
    if (!this.active) return null;
    return { ...this.active, y: dropY(this.grid, this.active) };
  }

  gravity(): number {
    if (this.mode.twentyG) return 20;
    return gravityFor(this.level);
  }

  lockDelay(): number {
    // Master mode tightens the lock delay from 30 frames down to 12.
    if (this.mode.twentyG) return Math.max(12, LOCK_DELAY - (this.level - 1) * 2);
    return LOCK_DELAY;
  }

  /** Seconds elapsed. */
  seconds(): number {
    return this.frame / 60;
  }

  /** True when the active piece is resting on something. */
  grounded(): boolean {
    return !!this.active && !fits(this.grid, { ...this.active, y: this.active.y + 1 });
  }

  // ---- Player actions --------------------------------------------------------

  move(dx: number): boolean {
    if (!this.active || this.over) return false;
    const moved = { ...this.active, x: this.active.x + dx };
    if (!fits(this.grid, moved)) return false;
    this.active = moved;
    this.lastWasRotation = false;
    this.afterManipulation();
    this.events.push({ type: 'move' });
    return true;
  }

  /** dir: 1 = clockwise, -1 = counter-clockwise, 2 = 180. */
  rotate(dir: 1 | -1 | 2): boolean {
    if (!this.active || this.over) return false;
    const from = this.active.rot;
    const to = ((from + dir + 4) % 4) as Rotation;
    const offsets = kicks(this.active.type, from, to);
    for (let i = 0; i < offsets.length; i++) {
      const cand = { ...this.active, rot: to, x: this.active.x + offsets[i].x, y: this.active.y + offsets[i].y };
      if (fits(this.grid, cand)) {
        this.active = cand;
        this.lastWasRotation = true;
        this.lastKick = i;
        this.afterManipulation();
        this.events.push({ type: 'rotate', spin: this.tSpinKind() !== 'none' });
        return true;
      }
    }
    return false;
  }

  hardDrop(): void {
    if (!this.active || this.over) return;
    const y = dropY(this.grid, this.active);
    const distance = y - this.active.y;
    if (distance > 0) this.lastWasRotation = false;
    this.active = { ...this.active, y };
    this.score += distance * 2;
    this.events.push({ type: 'harddrop', distance, cells: cellsOf(this.active) });
    this.lock();
  }

  holdPiece(): boolean {
    if (!this.active || this.over || this.holdUsed) return false;
    const current = this.active.type;
    const incoming = this.hold ?? this.bag.next();
    this.hold = current;
    this.holdUsed = true;
    this.stats.holds++;
    this.events.push({ type: 'hold' });
    this.spawn(incoming);
    return true;
  }

  /** Count a key press for the keys-per-piece statistic. */
  countInput(): void {
    this.stats.inputs++;
  }

  /** Versus: queue garbage that will rise after the next non-clearing lock. */
  receiveGarbage(rows: number): void {
    if (rows > 0) this.pending.push(rows);
  }

  /** Versus: take the attack produced since the last call. */
  drainAttack(): number {
    const a = this.outgoing;
    this.outgoing = 0;
    return a;
  }

  pendingGarbage(): number {
    return this.pending.reduce((a, b) => a + b, 0);
  }

  // ---- Frame step ------------------------------------------------------------

  /** Advance one frame. `softDrop` is whether soft drop is held this frame. */
  step(softDrop = false): void {
    if (this.over) return;
    this.frame++;
    if (this.mode.timeLimitFrames && this.frame >= this.mode.timeLimitFrames) {
      this.end(true, 'Time up');
      return;
    }
    if (!this.active) return;

    let g = this.gravity();
    if (softDrop) g = this.sdf >= INSTANT_SDF ? 20 : Math.max(g * this.sdf, 0.5);
    this.gravityAcc += g;
    while (this.gravityAcc >= 1 && this.active) {
      this.gravityAcc -= 1;
      const down: Piece = { ...this.active, y: this.active.y + 1 };
      if (!fits(this.grid, down)) {
        this.gravityAcc = 0;
        break;
      }
      this.active = down;
      this.lastWasRotation = false;
      if (softDrop) this.score += 1;
      this.noteDepth();
    }

    if (this.grounded()) {
      this.lockTimer++;
      if (this.lockTimer >= this.lockDelay()) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  // ---- Internals -------------------------------------------------------------

  private spawn(type: PieceType): void {
    const size = boxSize(type);
    const x = Math.floor((WIDTH - size) / 2);
    // Spawn just above the visible field, then drop one row if possible,
    // as the guideline does.
    let piece: Piece = { type, rot: 0, x, y: TOP - 2 - (type === 'I' ? 1 : 0) };
    this.pieceId++;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.gravityAcc = 0;
    this.lastWasRotation = false;
    this.lastKick = 0;
    if (!fits(this.grid, piece)) {
      this.active = null;
      this.topOut('Block out');
      return;
    }
    const lower = { ...piece, y: piece.y + 1 };
    if (fits(this.grid, lower)) piece = lower;
    if (this.mode.twentyG) piece = { ...piece, y: dropY(this.grid, piece) };
    this.active = piece;
    this.lowestY = piece.y;
    this.events.push({ type: 'spawn', piece: type });
  }

  private afterManipulation(): void {
    if (!this.active) return;
    if (this.mode.twentyG) {
      const y = dropY(this.grid, this.active);
      if (y !== this.active.y) this.lastWasRotation = false;
      this.active = { ...this.active, y };
    }
    this.noteDepth();
    // Move reset: a successful move or rotation restarts the lock timer, at
    // most MAX_LOCK_RESETS times per piece (reset again by reaching a new low).
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private noteDepth(): void {
    if (this.active && this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
    }
  }

  /** T-spin test: last action was a rotation and 3 of the 4 box corners are blocked. */
  private tSpinKind(): Spin {
    const p = this.active;
    if (!p || p.type !== 'T' || !this.lastWasRotation) return 'none';
    const corners = [
      [p.x, p.y], [p.x + 2, p.y], [p.x + 2, p.y + 2], [p.x, p.y + 2],
    ].map(([x, y]) => blocked(this.grid, x, y));
    const filled = corners.filter(Boolean).length;
    if (filled < 3) return 'none';
    // Front corners are the two on the side the T points to; corner i and
    // i+1 (mod 4) are the front pair for rotation i.
    const front = corners[p.rot] && corners[(p.rot + 1) % 4];
    return front || this.lastKick === 4 ? 'full' : 'mini';
  }

  private lock(): void {
    const p = this.active;
    if (!p) return;
    const spin = this.tSpinKind();
    place(this.grid, p, PIECE_ID[p.type]);
    this.active = null;
    this.stats.pieces++;
    this.holdUsed = false;

    if (cellsOf(p).every((c) => c.y < TOP)) {
      this.topOut('Lock out');
      if (this.over) return;
    }

    const garbageBefore = this.mode.startGarbage ? countGarbageRows(this.grid) : 0;
    const cleared = clearLines(this.grid);
    const n = cleared.length;
    const perfect = n > 0 && isEmpty(this.grid);

    if (n > 0) this.combo++;
    else this.combo = -1;
    const result = scoreClear(n, spin, this.level, Math.max(this.combo, 0), this.b2b > 0, perfect);
    if (n > 0) {
      if (isDifficult(n, spin)) this.b2b++;
      else this.b2b = 0;
    }
    this.score += result.points;
    this.lines += n;
    this.stats.clears[n]++;
    if (spin !== 'none') this.stats.tspins++;
    if (perfect) this.stats.perfectClears++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    this.stats.maxB2B = Math.max(this.stats.maxB2B, this.b2b - 1);

    // Versus: attack first cancels incoming garbage, the rest is sent.
    let attack = result.attack;
    while (attack > 0 && this.pending.length > 0) {
      const used = Math.min(attack, this.pending[0]);
      this.pending[0] -= used;
      attack -= used;
      if (this.pending[0] === 0) this.pending.shift();
    }
    this.outgoing += attack;
    this.stats.attackSent += attack;

    this.events.push({
      type: 'lock', lines: cleared, spin, label: result.label, points: result.points,
      combo: this.combo, b2b: result.b2bBonus, perfect, attack: result.attack,
    });

    if (n === 0 && this.pending.length > 0) this.riseGarbage();

    if (this.mode.startGarbage) {
      this.garbageLeft = countGarbageRows(this.grid);
      if (garbageBefore > 0 && this.garbageLeft === 0) {
        this.end(true, 'Dug out');
        return;
      }
    }

    if (this.mode.fixedLevel === undefined) {
      const lvl = Math.min(20, this.startLevel + Math.floor(this.lines / 10));
      if (lvl > this.level) {
        this.level = lvl;
        this.events.push({ type: 'levelup', level: lvl });
      }
    }
    if (this.mode.goalLines && this.lines >= this.mode.goalLines) {
      this.end(true, `${this.mode.goalLines} lines`);
      return;
    }
    if (!this.over) this.spawn(this.bag.next());
  }

  private riseGarbage(): void {
    for (const rows of this.pending) {
      const hole = this.garbageRng.int(WIDTH);
      this.stats.garbageReceived += rows;
      this.events.push({ type: 'garbage', rows });
      if (addGarbage(this.grid, rows, hole)) {
        this.pending = [];
        this.topOut('Garbage out');
        return;
      }
    }
    this.pending = [];
  }

  /** Dig mode: rows with a hole that moves around, never twice in the same column. */
  private addCheese(rows: number): void {
    let last = -1;
    for (let i = 0; i < rows; i++) {
      let hole = this.garbageRng.int(WIDTH - 1);
      if (hole >= last && last >= 0) hole++;
      addGarbage(this.grid, 1, hole);
      last = hole;
    }
    this.garbageLeft = rows;
  }

  private topOut(reason: string): void {
    if (this.mode.endless) {
      this.grid = emptyGrid();
      this.pending = [];
      this.stats.zenResets++;
      this.events.push({ type: 'zenreset' });
      if (!this.active && reason === 'Block out') this.spawn(this.bag.next());
      return;
    }
    this.end(false, reason);
  }

  private end(won: boolean, reason: string): void {
    if (this.over) return;
    this.over = true;
    this.won = won;
    this.endReason = reason;
    this.events.push({ type: 'end', won, reason });
  }
}
