// Myers' O(ND) greedy algorithm ("An O(ND) Difference Algorithm and Its
// Variations", 1986), forward direction, quadratic-space variant so every
// step can be replayed.
//
// For each edit count d = 0, 1, 2, ... and each diagonal k = x - y in
// -d, -d+2, ..., d, V[k] holds the largest x reached on diagonal k with
// exactly d edits. A step chooses between extending V[k+1] downwards (an
// insertion) and V[k-1] rightwards (a deletion), then slides along the
// "snake" of free diagonal moves. The first d whose furthest point reaches
// (N, M) is the edit distance.

import { pushEq, type Point, type Script } from './script';

export interface Snake {
  d: number;
  k: number;
  /** End of the (d-1)-path this one extends; equals `mid` for d = 0. */
  from: Point;
  /** Point after the single insertion or deletion, before the free diagonals. */
  mid: Point;
  /** Furthest point reached on diagonal k. */
  to: Point;
}

export interface MyersStep {
  d: number;
  /** V[k] after this step, for k = -d, -d+2, ..., d. */
  v: { k: number; x: number }[];
  snakes: Snake[];
}

export interface MyersResult {
  script: Script;
  d: number;
  steps: MyersStep[];
  /** The snakes on the final shortest path, in order from (0,0). */
  path: Snake[];
}

/** Diffs A[a0..a1) against B[b0..b1); script indices are absolute. */
export function myersRegion(a: readonly string[], b: readonly string[], a0 = 0, a1 = a.length, b0 = 0, b1 = b.length): MyersResult {
  const n = a1 - a0;
  const m = b1 - b0;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const steps: MyersStep[] = [];
  const byStep: Map<number, Snake>[] = [];

  for (let d = 0; d <= max; d++) {
    const snakes: Snake[] = [];
    const here = new Map<number, Snake>();
    let done: Snake | undefined;
    for (let k = 0 - d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) as number) < (v.get(k + 1) as number));
      const prevK = down ? k + 1 : k - 1;
      const px = v.get(prevK) as number;
      const py = px - prevK;
      const x0 = down ? px : px + 1;
      const y0 = x0 - k;
      let x = x0;
      let y = y0;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x++;
        y++;
      }
      v.set(k, x);
      const snake: Snake = { d, k, from: d === 0 ? { x: 0, y: 0 } : { x: px, y: py }, mid: { x: x0, y: y0 }, to: { x, y } };
      snakes.push(snake);
      here.set(k, snake);
      if (x >= n && y >= m && !done) done = snake;
    }
    const vs: { k: number; x: number }[] = [];
    for (let k = 0 - d; k <= d; k += 2) vs.push({ k, x: v.get(k) as number });
    steps.push({ d, v: vs, snakes });
    byStep.push(here);
    if (done) {
      const path = backtrack(byStep, done);
      return { script: toScript(path, a0, b0), d, steps, path };
    }
  }
  /* c8 ignore next */
  throw new Error('unreachable: d = N + M always reaches the corner');
}

export function myers(a: readonly string[], b: readonly string[]): MyersResult {
  return myersRegion(a, b);
}

function backtrack(byStep: Map<number, Snake>[], last: Snake): Snake[] {
  const path = [last];
  let cur = last;
  while (cur.d > 0) {
    const k = cur.from.x - cur.from.y;
    cur = (byStep[cur.d - 1] as Map<number, Snake>).get(k) as Snake;
    path.push(cur);
  }
  return path.reverse();
}

function toScript(path: Snake[], a0: number, b0: number): Script {
  const script: Script = [];
  for (const s of path) {
    if (s.d > 0) {
      if (s.mid.x > s.from.x) script.push({ type: 'del', a: a0 + s.from.x });
      else script.push({ type: 'ins', b: b0 + s.from.y });
    }
    pushEq(script, a0 + s.mid.x, b0 + s.mid.y, s.to.x - s.mid.x);
  }
  return script;
}
