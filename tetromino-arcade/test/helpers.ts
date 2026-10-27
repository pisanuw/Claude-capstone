import { HEIGHT, WIDTH, type Grid } from '../src/core/board';
import { GARBAGE_ID } from '../src/core/pieces';

/** Write rows (top to bottom, 'X' = filled) onto the bottom of the grid. */
export function setBottom(grid: Grid, rows: string[]): void {
  const start = HEIGHT - rows.length;
  rows.forEach((row, i) => {
    if (row.length !== WIDTH) throw new Error(`row ${i} must be ${WIDTH} wide`);
    grid[start + i] = [...row].map((ch) => (ch === 'X' ? GARBAGE_ID : 0));
  });
}

export function bottomRows(grid: Grid, n: number): string[] {
  return grid.slice(HEIGHT - n).map((r) => r.map((v) => (v ? 'X' : '.')).join(''));
}
