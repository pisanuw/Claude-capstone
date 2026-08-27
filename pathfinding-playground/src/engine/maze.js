// Map generators. Recursive division builds corridor-style mazes that stay
// fully connected: every dividing wall gets exactly one gap, and a wall line
// is only placed where its endpoints cannot seal a gap left by an earlier
// wall. scatterMud() sprinkles weighted terrain. Both take a seeded RNG so
// tests are reproducible.

import { EMPTY, WALL, MUD, idx } from './grid.js';

// Small, fast, deterministic PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

export function recursiveDivision(grid, rng) {
  grid.cells.fill(EMPTY);
  divide(grid, 0, 0, grid.cols, grid.rows, rng);
  // Start and goal always stay open. Clearing a single wall cell cannot
  // disconnect the maze, so it remains solvable.
  grid.cells[idx(grid, grid.start.r, grid.start.c)] = EMPTY;
  grid.cells[idx(grid, grid.goal.r, grid.goal.c)] = EMPTY;
}

function divide(grid, x, y, w, h, rng) {
  if (w < 4 && h < 4) return;
  // Leave some small chambers as open rooms so the maze breathes.
  if (w * h <= 24 && rng() < 0.5) return;
  let horizontal;
  if (h < 4) horizontal = false;
  else if (w < 4) horizontal = true;
  else horizontal = h === w ? rng() < 0.5 : h > w;

  if (horizontal) {
    if (!placeHorizontal(grid, x, y, w, h, rng) && w >= 4) placeVertical(grid, x, y, w, h, rng);
  } else {
    if (!placeVertical(grid, x, y, w, h, rng) && h >= 4) placeHorizontal(grid, x, y, w, h, rng);
  }
}

// A horizontal wall at row wy spans columns [x, x+w). It is safe only if the
// cells just outside both ends, (wy, x-1) and (wy, x+w), are walls or off the
// grid; otherwise it would seal the gap of a neighboring wall.
function placeHorizontal(grid, x, y, w, h, rng) {
  const candidates = [];
  for (let wy = y + 1; wy <= y + h - 2; wy++) {
    const leftSealed = x - 1 < 0 || grid.cells[idx(grid, wy, x - 1)] === WALL;
    const rightSealed = x + w >= grid.cols || grid.cells[idx(grid, wy, x + w)] === WALL;
    if (leftSealed && rightSealed) candidates.push(wy);
  }
  if (candidates.length === 0) return false;
  const wy = candidates[randInt(rng, 0, candidates.length - 1)];
  const gapX = randInt(rng, x, x + w - 1);
  for (let cx = x; cx < x + w; cx++) {
    if (cx !== gapX) grid.cells[idx(grid, wy, cx)] = WALL;
  }
  divide(grid, x, y, w, wy - y, rng);
  divide(grid, x, wy + 1, w, y + h - (wy + 1), rng);
  return true;
}

function placeVertical(grid, x, y, w, h, rng) {
  const candidates = [];
  for (let wx = x + 1; wx <= x + w - 2; wx++) {
    const topSealed = y - 1 < 0 || grid.cells[idx(grid, y - 1, wx)] === WALL;
    const bottomSealed = y + h >= grid.rows || grid.cells[idx(grid, y + h, wx)] === WALL;
    if (topSealed && bottomSealed) candidates.push(wx);
  }
  if (candidates.length === 0) return false;
  const wx = candidates[randInt(rng, 0, candidates.length - 1)];
  const gapY = randInt(rng, y, y + h - 1);
  for (let cy = y; cy < y + h; cy++) {
    if (cy !== gapY) grid.cells[idx(grid, cy, wx)] = WALL;
  }
  divide(grid, x, y, wx - x, h, rng);
  divide(grid, wx + 1, y, x + w - (wx + 1), h, rng);
  return true;
}

export function scatterMud(grid, density, rng) {
  const s = idx(grid, grid.start.r, grid.start.c);
  const g = idx(grid, grid.goal.r, grid.goal.c);
  for (let i = 0; i < grid.cells.length; i++) {
    if (i === s || i === g) continue;
    if (grid.cells[i] === EMPTY && rng() < density) grid.cells[i] = MUD;
  }
}

export function clearMap(grid) {
  grid.cells.fill(EMPTY);
}
