/**
 * Shared puzzle contract.
 *
 * Every puzzle exposes its states as short canonical strings ("keys"). The
 * enumerator never looks inside a key; it only asks for the start key, the
 * neighbours of a key and whether a key is a goal. `decode` turns a key into a
 * plain object that student heuristics and the mini renderers can read.
 *
 * All three puzzle families have reversible moves, so the state graph is
 * undirected. The enumerator relies on that when it computes distances to the
 * goal by searching backwards from the goal states.
 */

export interface HanoiDef {
  kind: 'hanoi';
  /** Number of disks, 1..8 (3^n states). */
  disks: number;
  /** Number of pegs, default 3. */
  pegs?: number;
}

export interface TilesDef {
  kind: 'tiles';
  rows: number;
  cols: number;
  /**
   * Start state as a flat array of tiles in reading order, 0 for the blank.
   * `'farthest'` (the default) picks the state farthest from the goal, which
   * is the most interesting start to watch a search from.
   */
  start?: number[] | 'farthest';
}

export interface BlocksDef {
  kind: 'blocks';
  /**
   * Rows of equal length. `.` empty, `#` wall, any other character a piece;
   * every piece must be a filled rectangle.
   */
  grid: string[];
  /** The piece that has to reach `row`,`col` (its top-left corner). */
  goal: { piece: string; row: number; col: number };
  /**
   * `free` (Klotski): any piece slides one cell in any direction.
   * `rushhour`: a piece slides only along its long axis.
   */
  moves?: 'free' | 'rushhour';
  /**
   * Mirror (left/right) symmetry reduction. `auto` enables it only when the
   * walls and the goal are themselves mirror-symmetric.
   */
  symmetry?: 'auto' | 'mirror' | 'none';
}

export type PuzzleDef = HanoiDef | TilesDef | BlocksDef;

export interface Puzzle<S = unknown> {
  def: PuzzleDef;
  /** Short human label, e.g. "Towers of Hanoi, 4 disks". */
  label: string;
  /** Canonical key of the start state, or `'farthest'` (see TilesDef.start). */
  start: string | 'farthest';
  /** A goal state the enumerator can start from when `start === 'farthest'`. */
  goalKey: string;
  isGoal(key: string): boolean;
  /** Canonical keys of the states one move away (may contain duplicates). */
  neighbors(key: string): string[];
  decode(key: string): S;
  /** Context object handed to student heuristics as the second argument. */
  context(): Record<string, unknown>;
}

export class PuzzleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PuzzleError';
  }
}
