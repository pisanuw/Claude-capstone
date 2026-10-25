// Patience diff (Bram Cohen, as in `git diff --patience`).
//
// 1. Match the common prefix and suffix of the region.
// 2. Collect tokens that occur exactly once in each side of what is left.
// 3. Keep the longest run of those unique pairs that is increasing on both
//    sides (an LIS, found with patience sorting) as anchors.
// 4. Recurse between consecutive anchors. A region with no unique common
//    token falls back to Myers.
//
// Anchoring on unique lines (function signatures, distinctive statements)
// rather than on frequent ones (blank lines, lone braces) is why patience
// output is often easier to read, even when it is not minimal.

import { myersRegion } from './myers';
import { pushEq, type Script } from './script';

export function patience(a: readonly string[], b: readonly string[]): Script {
  const script: Script = [];
  region(a, b, 0, a.length, 0, b.length, script);
  return script;
}

function region(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number, out: Script): void {
  let pre = 0;
  while (a0 + pre < a1 && b0 + pre < b1 && a[a0 + pre] === b[b0 + pre]) pre++;
  pushEq(out, a0, b0, pre);
  a0 += pre;
  b0 += pre;
  let suf = 0;
  while (a1 - suf > a0 && b1 - suf > b0 && a[a1 - suf - 1] === b[b1 - suf - 1]) suf++;
  a1 -= suf;
  b1 -= suf;

  if (a0 < a1 || b0 < b1) {
    const anchors = uniqueAnchors(a, b, a0, a1, b0, b1);
    if (anchors.length === 0) {
      out.push(...myersRegion(a, b, a0, a1, b0, b1).script);
    } else {
      let pa = a0;
      let pb = b0;
      for (const [ia, ib] of anchors) {
        region(a, b, pa, ia, pb, ib, out);
        out.push({ type: 'eq', a: ia, b: ib });
        pa = ia + 1;
        pb = ib + 1;
      }
      region(a, b, pa, a1, pb, b1, out);
    }
  }
  pushEq(out, a1, b1, suf);
}

/** Unique-in-both pairs (in A order) reduced to their longest increasing subsequence in B. */
export function uniqueAnchors(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number): [number, number][] {
  const count = new Map<string, { na: number; nb: number; ia: number; ib: number }>();
  for (let i = a0; i < a1; i++) {
    const c = count.get(a[i] as string) ?? { na: 0, nb: 0, ia: i, ib: -1 };
    c.na++;
    count.set(a[i] as string, c);
  }
  for (let j = b0; j < b1; j++) {
    const c = count.get(b[j] as string);
    if (c) {
      c.nb++;
      c.ib = j;
    }
  }
  const pairs: [number, number][] = [];
  for (let i = a0; i < a1; i++) {
    const c = count.get(a[i] as string) as { na: number; nb: number; ib: number };
    if (c.na === 1 && c.nb === 1) pairs.push([i, c.ib]);
  }
  return longestIncreasing(pairs);
}

/** Patience sorting: piles of B indices, each card linked to the top of the pile to its left. */
export function longestIncreasing(pairs: [number, number][]): [number, number][] {
  const tops: number[] = [];
  const back: number[] = new Array<number>(pairs.length).fill(-1);
  pairs.forEach(([, ib], idx) => {
    let lo = 0;
    let hi = tops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (((pairs[tops[mid] as number] as [number, number])[1]) < ib) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) back[idx] = tops[lo - 1] as number;
    tops[lo] = idx;
  });
  const out: [number, number][] = [];
  let cur = tops.length ? (tops[tops.length - 1] as number) : -1;
  while (cur >= 0) {
    out.push(pairs[cur] as [number, number]);
    cur = back[cur] as number;
  }
  return out.reverse();
}
