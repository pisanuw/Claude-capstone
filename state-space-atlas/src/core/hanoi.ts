import { PuzzleError, type HanoiDef, type Puzzle } from './puzzle';

export interface HanoiState {
  disks: number;
  pegs: number;
  /** on[i] = peg holding disk i (0 is the smallest disk). */
  on: number[];
  /** stacks[p] = disks on peg p from bottom to top. */
  stacks: number[][];
}

/**
 * Towers of Hanoi with `disks` disks on `pegs` pegs. A key is one digit per
 * disk giving the peg it sits on, smallest disk first. Every placement string
 * is a legal state (the order on a peg is forced by size), so there are
 * exactly pegs^disks states and all of them are reachable.
 */
export function createHanoi(def: HanoiDef): Puzzle<HanoiState> {
  const disks = def.disks;
  const pegs = def.pegs ?? 3;
  if (!Number.isInteger(disks) || disks < 1 || disks > 8) {
    throw new PuzzleError('Hanoi: disks must be an integer from 1 to 8');
  }
  if (!Number.isInteger(pegs) || pegs < 3 || pegs > 5) {
    throw new PuzzleError('Hanoi: pegs must be an integer from 3 to 5');
  }
  const start = '0'.repeat(disks);
  const goalKey = String(pegs - 1).repeat(disks);

  const decode = (key: string): HanoiState => {
    const on: number[] = [];
    const stacks: number[][] = Array.from({ length: pegs }, () => []);
    for (let i = 0; i < disks; i++) {
      const p = key.charCodeAt(i) - 48;
      on.push(p);
    }
    // Bottom to top means largest disk first.
    for (let i = disks - 1; i >= 0; i--) stacks[on[i]].push(i);
    return { disks, pegs, on, stacks };
  };

  const neighbors = (key: string): string[] => {
    // Top disk of each peg: the smallest disk index on it.
    const top: number[] = new Array(pegs).fill(-1);
    for (let i = disks - 1; i >= 0; i--) top[key.charCodeAt(i) - 48] = i;
    const out: string[] = [];
    for (let p = 0; p < pegs; p++) {
      const d = top[p];
      if (d < 0) continue;
      for (let q = 0; q < pegs; q++) {
        if (q === p) continue;
        if (top[q] >= 0 && top[q] < d) continue;
        out.push(key.slice(0, d) + String(q) + key.slice(d + 1));
      }
    }
    return out;
  };

  return {
    def,
    label: `Towers of Hanoi, ${disks} disk${disks === 1 ? '' : 's'}${pegs === 3 ? '' : `, ${pegs} pegs`}`,
    start,
    goalKey,
    isGoal: (key) => key === goalKey,
    neighbors,
    decode,
    context: () => ({ kind: 'hanoi', disks, pegs, goalPeg: pegs - 1 }),
  };
}
