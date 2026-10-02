import { type Board, cellCount, neighborTable, numbers } from './board';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface Game {
  board: Board;
  nums: number[];
  nbrs: number[][];
  /** 0 hidden, 1 open, 2 flagged. */
  cells: number[];
  status: GameStatus;
  /** The mine that ended the game, or -1. */
  exploded: number;
  opened: number;
}

export const HIDDEN = 0;
export const OPEN = 1;
export const FLAG = 2;

export function newGame(board: Board): Game {
  return {
    board,
    nums: numbers(board),
    nbrs: neighborTable(board),
    cells: new Array<number>(cellCount(board)).fill(HIDDEN),
    status: 'playing',
    exploded: -1,
    opened: 0,
  };
}

function safeCells(game: Game): number {
  return game.board.mines.reduce((n, m) => n + (m ? 0 : 1), 0);
}

/**
 * Open a cell. Opening an already open number whose flags are all placed
 * opens its remaining neighbors (a "chord"), as in desktop Minesweeper.
 */
export function openCell(game: Game, i: number): void {
  if (game.status !== 'playing' || game.cells[i] === FLAG) return;
  if (game.cells[i] === OPEN) {
    const ns = game.nbrs[i]!;
    const flags = ns.filter((j) => game.cells[j] === FLAG).length;
    if (flags !== game.nums[i]) return;
    for (const j of ns) if (game.cells[j] === HIDDEN) flood(game, j);
  } else {
    flood(game, i);
  }
  if (game.status === 'playing' && game.opened === safeCells(game)) game.status = 'won';
}

function flood(game: Game, start: number): void {
  if (game.status !== 'playing') return;
  if (game.board.mines[start]) {
    game.cells[start] = OPEN;
    game.status = 'lost';
    game.exploded = start;
    return;
  }
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (game.cells[i] !== HIDDEN) continue;
    game.cells[i] = OPEN;
    game.opened++;
    if (game.nums[i] === 0) for (const j of game.nbrs[i]!) if (game.cells[j] === HIDDEN) stack.push(j);
  }
}

export function toggleFlag(game: Game, i: number): void {
  if (game.status !== 'playing' || game.cells[i] === OPEN) return;
  game.cells[i] = game.cells[i] === FLAG ? HIDDEN : FLAG;
}

export function flagsPlaced(game: Game): number {
  return game.cells.filter((c) => c === FLAG).length;
}
