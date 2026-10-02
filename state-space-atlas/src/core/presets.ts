import type { BlocksDef, PuzzleDef } from './puzzle';

export interface PuzzlePreset {
  id: string;
  name: string;
  group: 'Towers of Hanoi' | 'Sliding tiles' | 'Klotski' | 'Rush Hour';
  /** Rough state count shown in the picker. */
  states: string;
  def: PuzzleDef;
}

/** The classic Huarong Dao / Klotski layout: free the 2x2 block through the bottom. */
export const KLOTSKI_CLASSIC: BlocksDef = {
  kind: 'blocks',
  grid: ['ABBC', 'ABBC', 'DEEF', 'DGHF', 'I..J'],
  goal: { piece: 'B', row: 3, col: 1 },
  moves: 'free',
};

/** A smaller Klotski-style warm-up: slide the square from the top-left corner to the bottom middle. */
export const KLOTSKI_MINI: BlocksDef = {
  kind: 'blocks',
  grid: ['XXAB', 'XXAB', 'C..D', 'EF.D'],
  goal: { piece: 'X', row: 2, col: 1 },
  moves: 'free',
};

/** Rush Hour card 1 from the original set: slide the red car (X) to the right edge. */
export const RUSH_HOUR_CARD_1: BlocksDef = {
  kind: 'blocks',
  grid: ['AA...O', 'P..Q.O', 'PXXQ.O', 'P..Q..', 'B...CC', 'B.RRR.'],
  goal: { piece: 'X', row: 2, col: 4 },
  moves: 'rushhour',
};

/** A denser Rush Hour board. */
export const RUSH_HOUR_JAM: BlocksDef = {
  kind: 'blocks',
  grid: ['AA.B..', 'C..B.D', 'CXXB.D', 'C.EE.F', 'G....F', 'GHHH..'],
  goal: { piece: 'X', row: 2, col: 4 },
  moves: 'rushhour',
};

export const PRESETS: PuzzlePreset[] = [
  { id: 'hanoi-3', name: '3 disks', group: 'Towers of Hanoi', states: '27', def: { kind: 'hanoi', disks: 3 } },
  { id: 'hanoi-4', name: '4 disks', group: 'Towers of Hanoi', states: '81', def: { kind: 'hanoi', disks: 4 } },
  { id: 'hanoi-5', name: '5 disks', group: 'Towers of Hanoi', states: '243', def: { kind: 'hanoi', disks: 5 } },
  { id: 'hanoi-6', name: '6 disks', group: 'Towers of Hanoi', states: '729', def: { kind: 'hanoi', disks: 6 } },
  { id: 'hanoi-7', name: '7 disks', group: 'Towers of Hanoi', states: '2,187', def: { kind: 'hanoi', disks: 7 } },
  { id: 'hanoi-4-4', name: '4 disks, 4 pegs', group: 'Towers of Hanoi', states: '256', def: { kind: 'hanoi', disks: 4, pegs: 4 } },
  { id: 'tiles-2x2', name: '2x2 (3-puzzle)', group: 'Sliding tiles', states: '12', def: { kind: 'tiles', rows: 2, cols: 2 } },
  { id: 'tiles-2x3', name: '2x3 (5-puzzle)', group: 'Sliding tiles', states: '360', def: { kind: 'tiles', rows: 2, cols: 3 } },
  { id: 'tiles-2x4', name: '2x4 (7-puzzle)', group: 'Sliding tiles', states: '20,160', def: { kind: 'tiles', rows: 2, cols: 4 } },
  { id: 'tiles-3x3', name: '3x3 (8-puzzle)', group: 'Sliding tiles', states: '181,440', def: { kind: 'tiles', rows: 3, cols: 3 } },
  { id: 'klotski-mini', name: 'Mini (4x4)', group: 'Klotski', states: '2,032', def: KLOTSKI_MINI },
  { id: 'klotski', name: 'Classic Huarong Dao (5x4)', group: 'Klotski', states: '13,011', def: KLOTSKI_CLASSIC },
  { id: 'rush-1', name: 'Card 1 (beginner)', group: 'Rush Hour', states: '1,247', def: RUSH_HOUR_CARD_1 },
  { id: 'rush-jam', name: 'Traffic jam', group: 'Rush Hour', states: '1,272', def: RUSH_HOUR_JAM },
];

export function presetById(id: string): PuzzlePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
