import { PuzzleError, type Puzzle, type TilesDef } from './puzzle';

export interface TilesState {
  rows: number;
  cols: number;
  /** tiles[r][c], 0 for the blank. */
  tiles: number[][];
  blank: { row: number; col: number };
  /** Where tile t belongs in the goal (index 0 unused). */
  goalRow: number[];
  goalCol: number[];
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

function parity(perm: number[]): number {
  let inversions = 0;
  for (let i = 0; i < perm.length; i++) {
    if (perm[i] === 0) continue;
    for (let j = i + 1; j < perm.length; j++) {
      if (perm[j] !== 0 && perm[j] < perm[i]) inversions++;
    }
  }
  return inversions % 2;
}

/**
 * Sliding tile puzzle (the 8-puzzle and its smaller cousins). A key is one
 * base-36 digit per cell in reading order, `0` for the blank. The goal has
 * tiles 1..n-1 in order with the blank in the last cell. Half of all
 * permutations are reachable from the goal; a custom start must lie in that
 * half, which is checked with the usual inversion-parity test.
 */
export function createTiles(def: TilesDef): Puzzle<TilesState> {
  const { rows, cols } = def;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2) {
    throw new PuzzleError('Tiles: rows and cols must be integers of at least 2');
  }
  const n = rows * cols;
  if (n > 9) {
    throw new PuzzleError('Tiles: at most 9 cells (3x3 already has 181,440 states)');
  }
  const goalArr: number[] = [];
  for (let i = 1; i < n; i++) goalArr.push(i);
  goalArr.push(0);
  const encode = (arr: number[]): string => arr.map((t) => DIGITS[t]).join('');
  const goalKey = encode(goalArr);

  let start: string | 'farthest' = 'farthest';
  if (Array.isArray(def.start)) {
    const s = def.start;
    const sorted = [...s].sort((a, b) => a - b);
    if (s.length !== n || sorted.some((v, i) => v !== i)) {
      throw new PuzzleError(`Tiles: start must contain each of 0..${n - 1} exactly once`);
    }
    if (!isSolvable(s, goalArr, rows, cols)) {
      throw new PuzzleError('Tiles: that start cannot reach the goal (wrong permutation parity)');
    }
    start = encode(s);
  } else if (def.start !== undefined && def.start !== 'farthest') {
    throw new PuzzleError("Tiles: start must be an array or 'farthest'");
  }

  const goalRow: number[] = new Array(n).fill(0);
  const goalCol: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const t = goalArr[i];
    goalRow[t] = Math.floor(i / cols);
    goalCol[t] = i % cols;
  }

  const decode = (key: string): TilesState => {
    const tiles: number[][] = [];
    let blank = { row: 0, col: 0 };
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const t = DIGITS.indexOf(key[r * cols + c]);
        if (t === 0) blank = { row: r, col: c };
        row.push(t);
      }
      tiles.push(row);
    }
    return { rows, cols, tiles, blank, goalRow, goalCol };
  };

  const neighbors = (key: string): string[] => {
    const b = key.indexOf('0');
    const br = Math.floor(b / cols);
    const bc = b % cols;
    const out: string[] = [];
    const swap = (j: number) => {
      const arr = key.split('');
      arr[b] = arr[j];
      arr[j] = '0';
      out.push(arr.join(''));
    };
    if (br > 0) swap(b - cols);
    if (br < rows - 1) swap(b + cols);
    if (bc > 0) swap(b - 1);
    if (bc < cols - 1) swap(b + 1);
    return out;
  };

  return {
    def,
    label: `${rows}x${cols} sliding tiles (${n - 1}-puzzle)`,
    start,
    goalKey,
    isGoal: (key) => key === goalKey,
    neighbors,
    decode,
    context: () => ({ kind: 'tiles', rows, cols, goalRow, goalCol }),
  };
}

/** Standard solvability test: same permutation parity after accounting for the blank row. */
export function isSolvable(start: number[], goal: number[], rows: number, cols: number): boolean {
  const blankRow = (arr: number[]) => Math.floor(arr.indexOf(0) / cols);
  const p1 = (parity(start) + (cols % 2 === 0 ? blankRow(start) : 0)) % 2;
  const p2 = (parity(goal) + (cols % 2 === 0 ? blankRow(goal) : 0)) % 2;
  void rows;
  return p1 === p2;
}
