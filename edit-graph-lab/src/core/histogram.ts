// Histogram diff, after JGit's HistogramDiff (the algorithm behind
// `git diff --histogram`).
//
// For a region, count how often each token occurs in A. Scan B for tokens
// that also occur in A, extend every such match into the longest equal run
// around it, and keep the run whose rarest token is rarest (ties broken by
// length). That run splits the region and both halves recurse. It is a
// generalisation of patience: unique lines still win, but low-occurrence
// lines can anchor too. Tokens occurring more than MAX_CHAIN times in A are
// ignored; a region with no usable match falls back to Myers.
//
// The tie-breaking rule here (rarest first, then longest) is a simplified,
// order-independent version of JGit's, so on rare inputs the two can pick
// different, equally valid anchors.

import { myersRegion } from './myers';
import { pushEq, type Script } from './script';

export const MAX_CHAIN = 64;

export function histogram(a: readonly string[], b: readonly string[]): Script {
  const script: Script = [];
  region(a, b, 0, a.length, 0, b.length, script);
  return script;
}

interface Run {
  as: number;
  bs: number;
  len: number;
  rarity: number;
}

function region(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number, out: Script): void {
  if (a0 >= a1 && b0 >= b1) return;
  const run = bestRun(a, b, a0, a1, b0, b1);
  if (!run) {
    out.push(...myersRegion(a, b, a0, a1, b0, b1).script);
    return;
  }
  region(a, b, a0, run.as, b0, run.bs, out);
  pushEq(out, run.as, run.bs, run.len);
  region(a, b, run.as + run.len, a1, run.bs + run.len, b1, out);
}

export function bestRun(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number): Run | null {
  const where = new Map<string, number[]>();
  for (let i = a0; i < a1; i++) {
    const list = where.get(a[i] as string);
    if (list) list.push(i);
    else where.set(a[i] as string, [i]);
  }
  const occ = (t: string) => (where.get(t) as number[]).length;
  let best: Run | null = null;
  for (let j = b0; j < b1; j++) {
    const list = where.get(b[j] as string);
    if (!list || list.length > MAX_CHAIN) continue;
    if (best && list.length > best.rarity) continue;
    for (const i of list) {
      let as = i;
      let bs = j;
      let rarity = list.length;
      while (as > a0 && bs > b0 && a[as - 1] === b[bs - 1]) {
        as--;
        bs--;
        rarity = Math.min(rarity, occ(a[as] as string));
      }
      let ae = i + 1;
      let be = j + 1;
      while (ae < a1 && be < b1 && a[ae] === b[be]) {
        rarity = Math.min(rarity, occ(a[ae] as string));
        ae++;
        be++;
      }
      const len = ae - as;
      if (!best || rarity < best.rarity || (rarity === best.rarity && len > best.len)) best = { as, bs, len, rarity };
    }
  }
  return best;
}
