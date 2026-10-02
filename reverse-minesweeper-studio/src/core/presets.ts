import { type Board, createBoard } from './board';

/** A preset drawing: `#` is a mine, anything else is safe. */
export interface Preset {
  id: string;
  name: string;
  rows: string[];
}

export const PRESETS: Preset[] = [
  {
    id: 'heart',
    name: 'Heart',
    rows: [
      '................',
      '................',
      '...###....###...',
      '..#####..#####..',
      '..############..',
      '..############..',
      '...##########...',
      '....########....',
      '.....######.....',
      '......####......',
      '.......##.......',
      '................',
      '................',
      '................',
    ],
  },
  {
    id: 'hi',
    name: 'HI',
    rows: [
      '................',
      '................',
      '..#...#..#####..',
      '..#...#....#....',
      '..#...#....#....',
      '..#####....#....',
      '..#...#....#....',
      '..#...#....#....',
      '..#...#..#####..',
      '................',
      '................',
      '................',
    ],
  },
  {
    id: 'box',
    name: 'Walled box',
    rows: [
      '..............',
      '..............',
      '...########...',
      '...#......#...',
      '...#......#...',
      '...#......#...',
      '...#......#...',
      '...#......#...',
      '...########...',
      '..............',
      '..............',
      '..............',
    ],
  },
  {
    id: 'trap',
    name: 'Box with a secret',
    rows: [
      '..............',
      '..............',
      '...########...',
      '...#......#...',
      '...#......#...',
      '...#..#...#...',
      '...#......#...',
      '...#......#...',
      '...########...',
      '..............',
      '..............',
      '..............',
    ],
  },
  {
    id: 'arrow',
    name: 'Arrow',
    rows: [
      '................',
      '................',
      '.........#......',
      '.........##.....',
      '..##########....',
      '..###########...',
      '..##########....',
      '.........##.....',
      '.........#......',
      '................',
      '................',
      '................',
    ],
  },
];

export function boardFromRows(rows: string[]): Board {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const board = createBoard(width, height);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) board.mines[y * width + x] = row[x] === '#';
  });
  return board;
}

/** Small deterministic PRNG (mulberry32) so random boards can be reproduced. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBoard(width: number, height: number, density: number, seed: number): Board {
  const board = createBoard(width, height);
  const rnd = mulberry32(seed);
  for (let i = 0; i < board.mines.length; i++) board.mines[i] = rnd() < density;
  return board;
}
