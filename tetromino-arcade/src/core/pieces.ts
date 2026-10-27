// Tetromino shapes and Super Rotation System (SRS) kick tables.
//
// Coordinates are (x, y) with y growing downward, matching the board's row
// order. Each piece is defined once in its spawn orientation inside an n x n
// box; the other three orientations come from rotating the box clockwise,
// which is exactly how SRS defines them.

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Rotation = 0 | 1 | 2 | 3; // 0 = spawn, 1 = R, 2 = 180, 3 = L

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Cell value stored on the board for each piece; 8 is garbage. */
export const PIECE_ID: Record<PieceType, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
export const GARBAGE_ID = 8;

export interface Cell {
  x: number;
  y: number;
}

const SPAWN_SHAPES: Record<PieceType, { size: number; rows: string[] }> = {
  I: { size: 4, rows: ['....', 'XXXX', '....', '....'] },
  O: { size: 2, rows: ['XX', 'XX'] },
  T: { size: 3, rows: ['.X.', 'XXX', '...'] },
  S: { size: 3, rows: ['.XX', 'XX.', '...'] },
  Z: { size: 3, rows: ['XX.', '.XX', '...'] },
  J: { size: 3, rows: ['X..', 'XXX', '...'] },
  L: { size: 3, rows: ['..X', 'XXX', '...'] },
};

export function boxSize(type: PieceType): number {
  return SPAWN_SHAPES[type].size;
}

function buildRotations(type: PieceType): Cell[][] {
  const { size, rows } = SPAWN_SHAPES[type];
  let cells: Cell[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'X') cells.push({ x, y });
    });
  });
  const out: Cell[][] = [];
  for (let r = 0; r < 4; r++) {
    out.push(cells.map((c) => ({ ...c })).sort((a, b) => a.y - b.y || a.x - b.x));
    // Clockwise rotation of a square box with y down: (x, y) -> (n-1-y, x).
    cells = cells.map(({ x, y }) => ({ x: size - 1 - y, y: x }));
  }
  return out;
}

const ROTATIONS: Record<PieceType, Cell[][]> = Object.fromEntries(
  PIECE_TYPES.map((t) => [t, buildRotations(t)]),
) as Record<PieceType, Cell[][]>;

/** Cells of a piece relative to its box origin. */
export function pieceCells(type: PieceType, rot: Rotation): readonly Cell[] {
  return ROTATIONS[type][rot];
}

// Kick tables from the SRS specification, written with y up (as published)
// and flipped to y down when looked up.
type Kick = readonly [number, number];
const JLSTZ_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
// 180-degree rotation is not part of SRS; this small table follows the
// common modern-client convention of trying straight, up, then sideways.
const HALF_TURN_KICKS: readonly Kick[] = [[0, 0], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1]];

/** Kick offsets (x, y-down) to try, in order, for a rotation from -> to. */
export function kicks(type: PieceType, from: Rotation, to: Rotation): Cell[] {
  let table: readonly Kick[];
  if (type === 'O') table = [[0, 0]];
  else if ((from + 2) % 4 === to) table = HALF_TURN_KICKS;
  else table = (type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`];
  return table.map(([x, y]) => ({ x, y: y === 0 ? 0 : -y }));
}
