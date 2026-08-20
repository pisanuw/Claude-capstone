// Grid model. Cells are stored in a flat Uint8Array, row-major.
// A cell is EMPTY (cost 1 to enter), WALL (impassable), or MUD (cost 5 to enter).

export const EMPTY = 0;
export const WALL = 1;
export const MUD = 2;
export const MUD_COST = 5;

export function makeGrid(cols, rows) {
  return {
    cols,
    rows,
    cells: new Uint8Array(cols * rows),
    start: { r: Math.floor(rows / 2), c: 2 },
    goal: { r: Math.floor(rows / 2), c: cols - 3 },
  };
}

export function cloneGrid(g) {
  return {
    cols: g.cols,
    rows: g.rows,
    cells: new Uint8Array(g.cells),
    start: { ...g.start },
    goal: { ...g.goal },
  };
}

export const idx = (grid, r, c) => r * grid.cols + c;
export const rc = (grid, i) => ({ r: Math.floor(i / grid.cols), c: i % grid.cols });
export const inBounds = (grid, r, c) => r >= 0 && r < grid.rows && c >= 0 && c < grid.cols;
export const cellAt = (grid, r, c) => grid.cells[idx(grid, r, c)];
export const isWall = (grid, r, c) => cellAt(grid, r, c) === WALL;
export const enterCost = (grid, r, c) => (cellAt(grid, r, c) === MUD ? MUD_COST : 1);

// Deterministic neighbor order: up, right, down, left.
const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export function neighbors(grid, r, c) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(grid, nr, nc) && !isWall(grid, nr, nc)) out.push({ r: nr, c: nc });
  }
  return out;
}

export function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

export function hasMud(grid) {
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === MUD) return true;
  return false;
}
