/**
 * A Minesweeper board: a width x height grid of cells, some of which hold a
 * mine, plus the safe cell the player is told to open first.
 *
 * Cells are addressed by a flat index `i = y * width + x` everywhere in the
 * core, which keeps the solver's sets and arrays cheap.
 */
export interface Board {
  width: number;
  height: number;
  /** One entry per cell: true when the cell holds a mine. */
  mines: boolean[];
  /** Index of the safe opening cell, or -1 when none has been chosen yet. */
  start: number;
}

export const MIN_SIZE = 4;
export const MAX_SIZE = 40;

export function createBoard(width: number, height: number): Board {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error('Board size must be whole numbers.');
  }
  if (width < MIN_SIZE || height < MIN_SIZE || width > MAX_SIZE || height > MAX_SIZE) {
    throw new Error(`Board sides must be between ${MIN_SIZE} and ${MAX_SIZE}.`);
  }
  return { width, height, mines: new Array<boolean>(width * height).fill(false), start: -1 };
}

export function cloneBoard(board: Board): Board {
  return { width: board.width, height: board.height, mines: board.mines.slice(), start: board.start };
}

export function cellCount(board: Board): number {
  return board.width * board.height;
}

export function indexOf(board: Board, x: number, y: number): number {
  return y * board.width + x;
}

export function coords(board: Board, i: number): [number, number] {
  return [i % board.width, Math.floor(i / board.width)];
}

/** Indices of the up-to-eight cells touching cell `i`. */
export function neighbors(board: Board, i: number): number[] {
  const [x, y] = coords(board, i);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < board.width && ny < board.height) out.push(ny * board.width + nx);
    }
  }
  return out;
}

/** Neighbor lists for every cell, computed once per board size. */
export function neighborTable(board: Board): number[][] {
  const table: number[][] = [];
  for (let i = 0; i < cellCount(board); i++) table.push(neighbors(board, i));
  return table;
}

/** The number a revealed cell would show: how many of its neighbors are mines. */
export function numbers(board: Board): number[] {
  const table = neighborTable(board);
  return table.map((ns) => ns.reduce((n, j) => n + (board.mines[j] ? 1 : 0), 0));
}

export function mineCount(board: Board): number {
  return board.mines.reduce((n, m) => n + (m ? 1 : 0), 0);
}

/**
 * Resize a board, keeping the drawing anchored at the top-left corner. The
 * start cell survives when it still fits.
 */
export function resizeBoard(board: Board, width: number, height: number): Board {
  const next = createBoard(width, height);
  for (let y = 0; y < Math.min(height, board.height); y++) {
    for (let x = 0; x < Math.min(width, board.width); x++) {
      next.mines[y * width + x] = board.mines[y * board.width + x]!;
    }
  }
  if (board.start >= 0) {
    const [sx, sy] = coords(board, board.start);
    if (sx < width && sy < height) next.start = sy * width + sx;
  }
  return next;
}

/** Why a board cannot be solved at all, or null when it is well formed. */
export function boardProblem(board: Board): string | null {
  if (board.start < 0) return 'Pick a safe starting cell.';
  if (board.start >= cellCount(board)) return 'The starting cell is off the board.';
  if (board.mines[board.start]) return 'The starting cell holds a mine.';
  if (mineCount(board) === 0) return 'Paint at least one mine.';
  return null;
}
