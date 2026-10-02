import { describe, expect, it } from 'vitest';
import { createBoard } from '../src/core/board';
import { FLAG, HIDDEN, OPEN, flagsPlaced, newGame, openCell, toggleFlag } from '../src/core/game';

function demo() {
  // 4x4 with mines at (3,0) and (3,1).
  const b = createBoard(4, 4);
  b.mines[3] = true;
  b.mines[7] = true;
  b.start = 12;
  return newGame(b);
}

describe('game', () => {
  it('flood-fills from a zero and wins once every safe cell is open', () => {
    const g = demo();
    openCell(g, 12);
    expect(g.cells[0]).toBe(OPEN);
    expect(g.cells[3]).toBe(HIDDEN);
    expect(g.status).toBe('won');
  });

  it('loses on a mine and ignores further input', () => {
    const g = demo();
    openCell(g, 3);
    expect(g.status).toBe('lost');
    expect(g.exploded).toBe(3);
    openCell(g, 12);
    toggleFlag(g, 0);
    expect(g.cells[12]).toBe(HIDDEN);
    expect(g.cells[0]).toBe(HIDDEN);
  });

  it('flags hidden cells only and will not open a flagged cell', () => {
    const g = demo();
    toggleFlag(g, 2);
    expect(g.cells[2]).toBe(FLAG);
    openCell(g, 2);
    expect(g.cells[2]).toBe(FLAG);
    expect(flagsPlaced(g)).toBe(1);
    toggleFlag(g, 2);
    expect(g.cells[2]).toBe(HIDDEN);
  });

  it('chords an open number whose flags are all placed', () => {
    const b = createBoard(4, 4);
    b.mines[0] = true;
    b.mines[15] = true;
    const g = newGame(b);
    openCell(g, 1); // shows 1
    toggleFlag(g, 1); // open cells cannot be flagged
    expect(g.cells[1]).toBe(OPEN);
    openCell(g, 1); // chord with no flags: nothing happens
    expect(g.cells[4]).toBe(HIDDEN);
    toggleFlag(g, 0);
    openCell(g, 1);
    expect(g.cells[4]).toBe(OPEN);
    expect(g.cells[5]).toBe(OPEN);
  });

  it('chording onto a wrong flag loses', () => {
    const b = createBoard(4, 4);
    b.mines[0] = true;
    const g = newGame(b);
    openCell(g, 1);
    toggleFlag(g, 4);
    openCell(g, 1);
    expect(g.status).toBe('lost');
  });
});
