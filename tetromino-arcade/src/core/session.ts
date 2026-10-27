// Input handling (DAS/ARR), recording and replay.
//
// Keys are applied at frame boundaries, so a recorded list of
// (frame, key, down) events plus the seed reproduces a game exactly.

import { Game, type GameOptions } from './game';
import { MODES, type ModeId } from './modes';

export type Key = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'r180' | 'hold';
export const KEYS: Key[] = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold'];

export interface Handling {
  /** Delayed auto shift: frames a direction is held before it repeats. */
  das: number;
  /** Auto repeat rate: frames between repeats; 0 = jump to the wall. */
  arr: number;
  /** Soft drop factor. */
  sdf: number;
}

export const DEFAULT_HANDLING: Handling = { das: 10, arr: 2, sdf: 20 };

/** Turns held keys into game actions, frame by frame. */
export class Controller {
  private readonly held = new Set<Key>();
  private dir: -1 | 0 | 1 = 0;
  private dasTimer = 0;
  private arrTimer = 0;

  constructor(private readonly handling: Handling) {}

  isHeld(k: Key): boolean {
    return this.held.has(k);
  }

  press(k: Key, game: Game): void {
    if (this.held.has(k)) return;
    this.held.add(k);
    game.countInput();
    switch (k) {
      case 'left':
      case 'right':
        this.dir = k === 'left' ? -1 : 1;
        this.dasTimer = 0;
        this.arrTimer = 0;
        game.move(this.dir);
        break;
      case 'hard':
        game.hardDrop();
        break;
      case 'cw':
        game.rotate(1);
        break;
      case 'ccw':
        game.rotate(-1);
        break;
      case 'r180':
        game.rotate(2);
        break;
      case 'hold':
        game.holdPiece();
        break;
      case 'soft':
        break;
    }
  }

  release(k: Key): void {
    this.held.delete(k);
    if ((k === 'left' && this.dir === -1) || (k === 'right' && this.dir === 1)) {
      // Fall back to the other direction if it is still held.
      const other = k === 'left' ? 'right' : 'left';
      this.dir = this.held.has(other) ? (other === 'left' ? -1 : 1) : 0;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
  }

  /** Auto-repeat for the held direction; call once per frame before game.step(). */
  update(game: Game): void {
    if (this.dir === 0) return;
    this.dasTimer++;
    if (this.dasTimer < this.handling.das) return;
    if (this.handling.arr === 0) {
      while (game.move(this.dir));
      return;
    }
    this.arrTimer++;
    if (this.arrTimer >= this.handling.arr) {
      this.arrTimer = 0;
      game.move(this.dir);
    }
  }

  softHeld(): boolean {
    return this.held.has('soft');
  }
}

export interface InputEvent {
  /** Frame number (game.frame before the step) the event applies to. */
  f: number;
  k: Key;
  d: boolean;
}

export interface Replay {
  v: 1;
  mode: ModeId;
  seed: number;
  startLevel: number;
  handling: Handling;
  events: InputEvent[];
  /** Frame count when the game ended, for the progress bar. */
  frames: number;
  score: number;
  lines: number;
  date: string;
}

/** A playable (or replaying) game: Game + Controller + input log. */
export class Session {
  readonly game: Game;
  readonly controller: Controller;
  readonly log: InputEvent[] = [];
  private queue: { k: Key; d: boolean }[] = [];
  private replayIdx = 0;

  constructor(
    opts: GameOptions,
    readonly handling: Handling = DEFAULT_HANDLING,
    private readonly replay?: Replay,
  ) {
    this.game = new Game({ ...opts, sdf: handling.sdf });
    this.controller = new Controller(handling);
  }

  static fromReplay(r: Replay): Session {
    return new Session({ mode: r.mode, seed: r.seed, startLevel: r.startLevel }, r.handling, r);
  }

  get isReplay(): boolean {
    return !!this.replay;
  }

  /** Replay progress in [0, 1]. */
  progress(): number {
    if (!this.replay || this.replay.frames === 0) return 0;
    return Math.min(1, this.game.frame / this.replay.frames);
  }

  press(k: Key): void {
    if (!this.replay) this.queue.push({ k, d: true });
  }

  release(k: Key): void {
    if (!this.replay) this.queue.push({ k, d: false });
  }

  /** Release everything (used on pause or blur so keys do not stick). */
  releaseAll(): void {
    for (const k of KEYS) if (this.controller.isHeld(k)) this.release(k);
  }

  tick(): void {
    const g = this.game;
    if (g.over) return;
    const f = g.frame;
    let batch: { k: Key; d: boolean }[];
    if (this.replay) {
      batch = [];
      const ev = this.replay.events;
      while (this.replayIdx < ev.length && ev[this.replayIdx].f <= f) {
        batch.push({ k: ev[this.replayIdx].k, d: ev[this.replayIdx].d });
        this.replayIdx++;
      }
    } else {
      batch = this.queue;
      this.queue = [];
    }
    for (const e of batch) {
      if (!this.replay) this.log.push({ f, k: e.k, d: e.d });
      if (e.d) this.controller.press(e.k, g);
      else this.controller.release(e.k);
      if (g.over) return;
    }
    this.controller.update(g);
    g.step(this.controller.softHeld());
  }

  toReplay(): Replay {
    const g = this.game;
    return {
      v: 1,
      mode: g.mode.id,
      seed: g.seed,
      startLevel: g.startLevel,
      handling: { ...this.handling },
      events: this.log.slice(),
      frames: g.frame,
      score: g.score,
      lines: g.lines,
      date: new Date().toISOString(),
    };
  }
}

/** Validate an untrusted replay (for example a file the user loaded). */
export function parseReplay(text: string): Replay {
  const r = JSON.parse(text) as Partial<Replay>;
  const okNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (r.v !== 1 || typeof r.mode !== 'string' || !(r.mode in MODES) || !okNum(r.seed) || !Array.isArray(r.events)) {
    throw new Error('Not a Tetromino Arcade replay file');
  }
  if (r.mode === 'versus') throw new Error('Versus games cannot be replayed');
  const h = r.handling;
  if (!h || !okNum(h.das) || !okNum(h.arr) || !okNum(h.sdf)) throw new Error('Replay is missing handling settings');
  for (const e of r.events) {
    if (!okNum(e.f) || !KEYS.includes(e.k) || typeof e.d !== 'boolean') throw new Error('Replay has a malformed input event');
  }
  return {
    v: 1, mode: r.mode, seed: r.seed, startLevel: okNum(r.startLevel) ? r.startLevel : 1,
    handling: { das: h.das, arr: h.arr, sdf: h.sdf }, events: r.events,
    frames: okNum(r.frames) ? r.frames : 0, score: okNum(r.score) ? r.score : 0,
    lines: okNum(r.lines) ? r.lines : 0, date: typeof r.date === 'string' ? r.date : '',
  };
}
