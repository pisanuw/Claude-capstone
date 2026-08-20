// Shareable URLs. The whole puzzle (grid size, walls, mud, start, goal,
// algorithm picks, compare mode) is run-length encoded into a base64url
// payload carried in the location hash, so a specific map can be handed to a
// class as a plain link. decodeState() returns null on anything malformed.

import { EMPTY, WALL, MUD, makeGrid } from './grid.js';
import { ALGORITHMS } from './algorithms.js';

const CHAR_OF = { [EMPTY]: '.', [WALL]: '#', [MUD]: '~' };
const VAL_OF = { '.': EMPTY, '#': WALL, '~': MUD };

export function rleEncode(cells) {
  let out = '';
  let i = 0;
  while (i < cells.length) {
    const v = cells[i];
    let j = i;
    while (j < cells.length && cells[j] === v) j++;
    const run = j - i;
    out += (run > 1 ? String(run) : '') + CHAR_OF[v];
    i = j;
  }
  return out;
}

export function rleDecode(s, len) {
  const arr = new Uint8Array(len);
  let i = 0;
  let p = 0;
  while (p < s.length) {
    let digits = '';
    while (p < s.length && s[p] >= '0' && s[p] <= '9') digits += s[p++];
    const ch = s[p++];
    if (!(ch in VAL_OF)) throw new Error(`bad cell char: ${ch}`);
    const run = digits ? parseInt(digits, 10) : 1;
    if (i + run > len) throw new Error('rle overflow');
    arr.fill(VAL_OF[ch], i, i + run);
    i += run;
  }
  if (i !== len) throw new Error('rle underflow');
  return arr;
}

function toB64u(s) {
  const b64 = typeof btoa === 'function'
    ? btoa(s)
    : Buffer.from(s, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

const MAX_DIM = 128;

export function encodeState({ grid, algoA, algoB, compare }) {
  const payload = {
    v: 1,
    w: grid.cols,
    h: grid.rows,
    s: [grid.start.r, grid.start.c],
    g: [grid.goal.r, grid.goal.c],
    m: rleEncode(grid.cells),
    a: algoA,
    b: algoB,
    c: compare ? 1 : 0,
  };
  return toB64u(JSON.stringify(payload));
}

export function decodeState(str) {
  try {
    const p = JSON.parse(fromB64u(str));
    if (p.v !== 1) return null;
    const cols = p.w | 0;
    const rows = p.h | 0;
    if (cols < 4 || rows < 4 || cols > MAX_DIM || rows > MAX_DIM) return null;
    if (!(p.a in ALGORITHMS)) return null;
    const algoB = p.b in ALGORITHMS ? p.b : 'dijkstra';
    const grid = makeGrid(cols, rows);
    grid.cells = rleDecode(String(p.m), cols * rows);
    const [sr, sc] = p.s.map((x) => x | 0);
    const [gr, gc] = p.g.map((x) => x | 0);
    const ok = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
    if (!ok(sr, sc) || !ok(gr, gc)) return null;
    if (sr === gr && sc === gc) return null;
    grid.start = { r: sr, c: sc };
    grid.goal = { r: gr, c: gc };
    // Start and goal must sit on passable cells.
    grid.cells[sr * cols + sc] = grid.cells[sr * cols + sc] === WALL ? EMPTY : grid.cells[sr * cols + sc];
    grid.cells[gr * cols + gc] = grid.cells[gr * cols + gc] === WALL ? EMPTY : grid.cells[gr * cols + gc];
    return { grid, algoA: p.a, algoB, compare: p.c === 1 };
  } catch {
    return null;
  }
}
