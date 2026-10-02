import { describe, expect, it } from 'vitest';
import {
  boardProblem,
  cloneBoard,
  coords,
  createBoard,
  indexOf,
  mineCount,
  neighbors,
  numbers,
  resizeBoard,
} from '../src/core/board';

describe('board', () => {
  it('creates an empty board and rejects bad sizes', () => {
    const b = createBoard(5, 4);
    expect(b.mines).toHaveLength(20);
    expect(b.start).toBe(-1);
    expect(() => createBoard(3, 10)).toThrow(/between/);
    expect(() => createBoard(41, 10)).toThrow(/between/);
    expect(() => createBoard(4.5, 10)).toThrow(/whole/);
  });

  it('maps between indices and coordinates', () => {
    const b = createBoard(5, 4);
    expect(indexOf(b, 3, 2)).toBe(13);
    expect(coords(b, 13)).toEqual([3, 2]);
  });

  it('lists 3, 5 or 8 neighbors depending on position', () => {
    const b = createBoard(5, 5);
    expect(neighbors(b, 0).sort((a, c) => a - c)).toEqual([1, 5, 6]);
    expect(neighbors(b, 2)).toHaveLength(5);
    expect(neighbors(b, 12)).toHaveLength(8);
  });

  it('counts adjacent mines', () => {
    const b = createBoard(4, 4);
    b.mines[5] = true;
    b.mines[6] = true;
    const n = numbers(b);
    expect(n[0]).toBe(1);
    expect(n[1]).toBe(2);
    expect(n[15]).toBe(0);
    expect(n[10]).toBe(2);
    expect(mineCount(b)).toBe(2);
  });

  it('clones without sharing the mine array', () => {
    const b = createBoard(4, 4);
    const c = cloneBoard(b);
    c.mines[0] = true;
    expect(b.mines[0]).toBe(false);
  });

  it('resizes anchored at the top-left, keeping the start when it fits', () => {
    const b = createBoard(6, 6);
    b.mines[indexOf(b, 1, 1)] = true;
    b.mines[indexOf(b, 5, 5)] = true;
    b.start = indexOf(b, 2, 3);
    const small = resizeBoard(b, 4, 4);
    expect(mineCount(small)).toBe(1);
    expect(small.mines[indexOf(small, 1, 1)]).toBe(true);
    expect(coords(small, small.start)).toEqual([2, 3]);
    b.start = indexOf(b, 5, 0);
    expect(resizeBoard(b, 4, 4).start).toBe(-1);
    const big = resizeBoard(b, 8, 7);
    expect(big.mines[indexOf(big, 5, 5)]).toBe(true);
  });

  it('explains why a board is not ready', () => {
    const b = createBoard(4, 4);
    expect(boardProblem(b)).toMatch(/starting cell/);
    b.start = 99;
    expect(boardProblem(b)).toMatch(/off the board/);
    b.start = 0;
    expect(boardProblem(b)).toMatch(/at least one mine/);
    b.mines[0] = true;
    expect(boardProblem(b)).toMatch(/holds a mine/);
    b.start = 15;
    expect(boardProblem(b)).toBeNull();
  });
});
