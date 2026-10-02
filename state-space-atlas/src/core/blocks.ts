import { PuzzleError, type BlocksDef, type Puzzle } from './puzzle';

export interface BlockShape {
  /** Letter used for this shape inside state keys. The goal piece is always `X`. */
  code: string;
  w: number;
  h: number;
  goal: boolean;
}

export interface BlockPiece {
  shape: string;
  row: number;
  col: number;
  w: number;
  h: number;
  goal: boolean;
}

export interface BlocksState {
  rows: number;
  cols: number;
  /** cells[r][c]: '.', '#', or a shape letter. */
  cells: string[][];
  /** Pieces in reading order of their top-left corner. */
  pieces: BlockPiece[];
  /** The piece that has to reach the goal. */
  goalPiece: BlockPiece;
  goal: { row: number; col: number };
}

const EMPTY = '.';
const WALL = '#';
const SHAPE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWYZabcdefghijklmnopqrstuvwxyz';

interface Parsed {
  rows: number;
  cols: number;
  shapes: Map<string, BlockShape>;
  startCells: string;
  goalShape: BlockShape;
  moves: 'free' | 'rushhour';
  mirror: boolean;
}

function parseDef(def: BlocksDef): Parsed {
  const grid = def.grid;
  if (!Array.isArray(grid) || grid.length < 1 || grid.length > 8) {
    throw new PuzzleError('Blocks: grid must have 1 to 8 rows');
  }
  const rows = grid.length;
  const cols = grid[0].length;
  if (cols < 1 || cols > 8 || grid.some((r) => typeof r !== 'string' || r.length !== cols)) {
    throw new PuzzleError('Blocks: every row must be a string of the same length (1 to 8)');
  }
  if (!def.goal || typeof def.goal.piece !== 'string') {
    throw new PuzzleError('Blocks: goal must name a piece and its target row/col');
  }
  const moves = def.moves ?? 'free';
  if (moves !== 'free' && moves !== 'rushhour') {
    throw new PuzzleError("Blocks: moves must be 'free' or 'rushhour'");
  }

  // Find each piece's bounding box and check it is a filled rectangle.
  const boxes = new Map<string, { r0: number; c0: number; r1: number; c1: number; n: number }>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      if (ch === EMPTY || ch === WALL) continue;
      const b = boxes.get(ch);
      if (!b) boxes.set(ch, { r0: r, c0: c, r1: r, c1: c, n: 1 });
      else {
        b.r0 = Math.min(b.r0, r);
        b.c0 = Math.min(b.c0, c);
        b.r1 = Math.max(b.r1, r);
        b.c1 = Math.max(b.c1, c);
        b.n++;
      }
    }
  }
  if (boxes.size === 0) throw new PuzzleError('Blocks: the grid has no pieces');
  if (boxes.size > 24) throw new PuzzleError('Blocks: at most 24 pieces');
  for (const [id, b] of boxes) {
    const w = b.c1 - b.c0 + 1;
    const h = b.r1 - b.r0 + 1;
    if (w * h !== b.n) throw new PuzzleError(`Blocks: piece '${id}' is not a filled rectangle`);
  }
  const goalBox = boxes.get(def.goal.piece);
  if (!goalBox) throw new PuzzleError(`Blocks: goal piece '${def.goal.piece}' is not on the grid`);
  const gw = goalBox.c1 - goalBox.c0 + 1;
  const gh = goalBox.r1 - goalBox.r0 + 1;
  const { row: gr, col: gc } = def.goal;
  if (!Number.isInteger(gr) || !Number.isInteger(gc) || gr < 0 || gc < 0 || gr + gh > rows || gc + gw > cols) {
    throw new PuzzleError('Blocks: goal position puts the goal piece outside the grid');
  }

  // Shapes: pieces of the same size are interchangeable, except the goal piece.
  const shapes = new Map<string, BlockShape>();
  const shapeKey = (w: number, h: number, goal: boolean) => (goal ? 'X' : `${w}x${h}`);
  const sizes: Array<[number, number]> = [];
  for (const [id, b] of boxes) {
    if (id === def.goal.piece) continue;
    sizes.push([b.c1 - b.c0 + 1, b.r1 - b.r0 + 1]);
  }
  sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1] || b[1] - a[1] || b[0] - a[0]);
  let li = 0;
  for (const [w, h] of sizes) {
    const k = shapeKey(w, h, false);
    if (!shapes.has(k)) shapes.set(k, { code: SHAPE_LETTERS[li++], w, h, goal: false });
  }
  const goalShape: BlockShape = { code: 'X', w: gw, h: gh, goal: true };
  shapes.set('X', goalShape);

  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      if (ch === EMPTY || ch === WALL) cells += ch;
      else {
        const b = boxes.get(ch)!;
        cells += shapes.get(shapeKey(b.c1 - b.c0 + 1, b.r1 - b.r0 + 1, ch === def.goal.piece))!.code;
      }
    }
  }

  const symmetry = def.symmetry ?? 'auto';
  let mirror = false;
  if (symmetry === 'mirror' || symmetry === 'auto') {
    const goalSymmetric = 2 * gc + gw === cols;
    let wallsSymmetric = true;
    for (let r = 0; r < rows && wallsSymmetric; r++) {
      for (let c = 0; c < cols; c++) {
        if ((grid[r][c] === WALL) !== (grid[r][cols - 1 - c] === WALL)) {
          wallsSymmetric = false;
          break;
        }
      }
    }
    if (goalSymmetric && wallsSymmetric) mirror = true;
    else if (symmetry === 'mirror') {
      throw new PuzzleError('Blocks: mirror symmetry needs a centred goal and symmetric walls');
    }
  } else if (symmetry !== 'none') {
    throw new PuzzleError("Blocks: symmetry must be 'auto', 'mirror' or 'none'");
  }

  return { rows, cols, shapes, startCells: cells, goalShape, moves, mirror };
}

export function mirrorKey(key: string, rows: number, cols: number): string {
  let out = '';
  for (let r = 0; r < rows; r++) {
    const row = key.slice(r * cols, (r + 1) * cols);
    out += row.split('').reverse().join('');
  }
  return out;
}

/**
 * Sliding block puzzles: Klotski (free movement) and Rush Hour (pieces move
 * along their long axis). A key is the grid in reading order with each cell
 * holding `.`, `#`, or a shape letter; pieces of the same size share a letter
 * so interchangeable positions collapse into one state. The goal piece has
 * its own letter `X`. When the goal and walls are mirror-symmetric the key is
 * the lexicographically smaller of the grid and its mirror image.
 */
export function createBlocks(def: BlocksDef): Puzzle<BlocksState> {
  const p = parseDef(def);
  const { rows, cols, shapes, moves, mirror } = p;
  const byCode = new Map<string, BlockShape>();
  for (const s of shapes.values()) byCode.set(s.code, s);
  const goal = { row: def.goal.row, col: def.goal.col };
  const goalShape = p.goalShape;

  const canon = (key: string): string => {
    if (!mirror) return key;
    const m = mirrorKey(key, rows, cols);
    return m < key ? m : key;
  };

  const scanPieces = (key: string): BlockPiece[] => {
    const seen = new Uint8Array(rows * cols);
    const pieces: BlockPiece[] = [];
    for (let i = 0; i < key.length; i++) {
      if (seen[i]) continue;
      const ch = key[i];
      if (ch === EMPTY || ch === WALL) continue;
      const s = byCode.get(ch)!;
      const r = Math.floor(i / cols);
      const c = i % cols;
      for (let dr = 0; dr < s.h; dr++) {
        for (let dc = 0; dc < s.w; dc++) seen[(r + dr) * cols + c + dc] = 1;
      }
      pieces.push({ shape: ch, row: r, col: c, w: s.w, h: s.h, goal: s.goal });
    }
    return pieces;
  };

  const decode = (key: string): BlocksState => {
    const cells: string[][] = [];
    for (let r = 0; r < rows; r++) cells.push(key.slice(r * cols, (r + 1) * cols).split(''));
    const pieces = scanPieces(key);
    const goalPiece = pieces.find((pc) => pc.goal)!;
    return { rows, cols, cells, pieces, goalPiece, goal };
  };

  const isGoalRaw = (key: string): boolean => {
    const i = key.indexOf('X');
    return i === goal.row * cols + goal.col;
  };
  const isGoal = (key: string): boolean => {
    if (isGoalRaw(key)) return true;
    return mirror && isGoalRaw(mirrorKey(key, rows, cols));
  };

  const DIRS: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const neighbors = (key: string): string[] => {
    const out: string[] = [];
    for (const pc of scanPieces(key)) {
      for (const [dr, dc] of DIRS) {
        if (moves === 'rushhour') {
          if (pc.w > pc.h && dr !== 0) continue;
          if (pc.h > pc.w && dc !== 0) continue;
        }
        const nr = pc.row + dr;
        const nc = pc.col + dc;
        if (nr < 0 || nc < 0 || nr + pc.h > rows || nc + pc.w > cols) continue;
        // Cells the piece moves into must be empty (its own cells count as free).
        let ok = true;
        for (let r = nr; r < nr + pc.h && ok; r++) {
          for (let c = nc; c < nc + pc.w; c++) {
            const ch = key[r * cols + c];
            if (ch === EMPTY) continue;
            const inside = r >= pc.row && r < pc.row + pc.h && c >= pc.col && c < pc.col + pc.w;
            if (!inside) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;
        const arr = key.split('');
        for (let r = pc.row; r < pc.row + pc.h; r++) {
          for (let c = pc.col; c < pc.col + pc.w; c++) arr[r * cols + c] = EMPTY;
        }
        for (let r = nr; r < nr + pc.h; r++) {
          for (let c = nc; c < nc + pc.w; c++) arr[r * cols + c] = pc.shape;
        }
        out.push(canon(arr.join('')));
      }
    }
    return out;
  };

  const start = canon(p.startCells);
  const goalKey = start; // Only used when start === 'farthest', which blocks never use.

  return {
    def,
    label: `${moves === 'rushhour' ? 'Rush Hour' : 'Sliding blocks'} ${rows}x${cols}, ${scanPieces(start).length} pieces`,
    start,
    goalKey,
    isGoal,
    neighbors,
    decode,
    context: () => ({
      kind: 'blocks',
      rows,
      cols,
      moves,
      mirror,
      goal,
      goalPiece: { w: goalShape.w, h: goalShape.h },
      shapes: [...shapes.values()],
    }),
  };
}
