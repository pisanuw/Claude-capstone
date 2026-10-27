import { GARBAGE_ID, pieceCells, type PieceType, type Rotation } from './pieces';

export const WIDTH = 10;
/** Total rows including the hidden buffer above the visible field. */
export const HEIGHT = 40;
export const VISIBLE = 20;
/** Index of the first visible row. */
export const TOP = HEIGHT - VISIBLE;

export type Grid = number[][];

export interface Piece {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

export function emptyGrid(): Grid {
  return Array.from({ length: HEIGHT }, () => new Array<number>(WIDTH).fill(0));
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

export function cellsOf(p: Piece): { x: number; y: number }[] {
  return pieceCells(p.type, p.rot).map((c) => ({ x: c.x + p.x, y: c.y + p.y }));
}

/** True when (x, y) is a wall, floor, or filled cell. */
export function blocked(g: Grid, x: number, y: number): boolean {
  if (x < 0 || x >= WIDTH || y >= HEIGHT) return true;
  if (y < 0) return false;
  return g[y][x] !== 0;
}

export function fits(g: Grid, p: Piece): boolean {
  return cellsOf(p).every((c) => !blocked(g, c.x, c.y));
}

/** Lowest y the piece can fall to from its current position. */
export function dropY(g: Grid, p: Piece): number {
  let y = p.y;
  while (fits(g, { ...p, y: y + 1 })) y++;
  return y;
}

export function place(g: Grid, p: Piece, value: number): void {
  for (const c of cellsOf(p)) {
    if (c.y >= 0 && c.y < HEIGHT) g[c.y][c.x] = value;
  }
}

/** Remove full rows; returns the indices that were cleared (top to bottom). */
export function clearLines(g: Grid): number[] {
  const full: number[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    if (g[y].every((v) => v !== 0)) full.push(y);
  }
  for (const y of full) {
    g.splice(y, 1);
    g.unshift(new Array<number>(WIDTH).fill(0));
  }
  return full;
}

export function isEmpty(g: Grid): boolean {
  return g.every((row) => row.every((v) => v === 0));
}

/**
 * Push `rows` garbage rows up from the bottom, each with a hole at `hole`.
 * Returns true if anything was pushed out of the top of the buffer (a top-out).
 */
export function addGarbage(g: Grid, rows: number, hole: number): boolean {
  let overflow = false;
  for (let i = 0; i < rows; i++) {
    const top = g.shift() as number[];
    if (top.some((v) => v !== 0)) overflow = true;
    const row = new Array<number>(WIDTH).fill(GARBAGE_ID);
    row[hole] = 0;
    g.push(row);
  }
  return overflow;
}

/** Height of the stack measured in rows from the floor. */
export function stackHeight(g: Grid): number {
  for (let y = 0; y < HEIGHT; y++) {
    if (g[y].some((v) => v !== 0)) return HEIGHT - y;
  }
  return 0;
}

export function countGarbageRows(g: Grid): number {
  return g.filter((row) => row.includes(GARBAGE_ID)).length;
}
