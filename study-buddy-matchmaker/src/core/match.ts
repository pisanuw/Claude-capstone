// Complementary pairing. Student a can help b on a topic when a is strong in
// it and b is not; the gain is the difference in mastery. A pair's score adds
// the help flowing both ways plus a bonus for the smaller direction, so a
// pair where each teaches the other beats one where only one side benefits,
// and subtracts a little for each topic where both have a gap (nobody in the
// pair can help). Pairs are chosen to maximise the total score over the
// class: exactly by dynamic programming up to 20 students, by greedy
// matching plus pair-swap improvement above that.

import { level, type Profile, type Thresholds } from './gradebook';

export interface Help {
  topic: string;
  teacher: number;
  learner: number;
  /** Teacher mastery minus learner mastery. */
  gain: number;
}

export interface PairScore {
  score: number;
  help: Help[];
  sharedGaps: string[];
}

export interface Group {
  members: number[];
  score: number;
  help: Help[];
  sharedGaps: string[];
}

export interface MatchOptions {
  thresholds: Thresholds;
  /** Penalty per topic where both students have a gap. */
  sharedGapPenalty?: number;
  /** Pairs of student indices that must not be grouped. */
  apart?: [number, number][];
  /** Exact search up to this many students (bitmask DP). */
  exactLimit?: number;
}

const FORBIDDEN = -1e6;

export function helpBetween(ps: Profile[], a: number, b: number, topics: string[], th: Thresholds): Help[] {
  const out: Help[] = [];
  for (const t of topics) {
    const ma = (ps[a] as Profile).mastery.get(t);
    const mb = (ps[b] as Profile).mastery.get(t);
    if (typeof ma !== 'number' || typeof mb !== 'number') continue;
    if (ma >= th.strong && mb < th.strong) out.push({ topic: t, teacher: a, learner: b, gain: ma - mb });
    else if (mb >= th.strong && ma < th.strong) out.push({ topic: t, teacher: b, learner: a, gain: mb - ma });
  }
  return out;
}

export function pairScore(ps: Profile[], a: number, b: number, topics: string[], opts: MatchOptions): PairScore {
  const th = opts.thresholds;
  const help = helpBetween(ps, a, b, topics, th);
  const ab = help.filter((h) => h.teacher === a).reduce((s, h) => s + h.gain, 0);
  const ba = help.filter((h) => h.teacher === b).reduce((s, h) => s + h.gain, 0);
  const sharedGaps = topics.filter(
    (t) => level((ps[a] as Profile).mastery.get(t), th) === 'gap' && level((ps[b] as Profile).mastery.get(t), th) === 'gap',
  );
  const score = ab + ba + Math.min(ab, ba) - (opts.sharedGapPenalty ?? 0.15) * sharedGaps.length;
  return { score, help, sharedGaps };
}

/** Symmetric weight matrix; forbidden pairs get a large negative weight. */
export function weights(ps: Profile[], topics: string[], opts: MatchOptions): number[][] {
  const n = ps.length;
  const w = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const apart = new Set((opts.apart ?? []).map(([x, y]) => (x < y ? `${x},${y}` : `${y},${x}`)));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = apart.has(`${i},${j}`) ? FORBIDDEN : pairScore(ps, i, j, topics, opts).score;
      (w[i] as number[])[j] = v;
      (w[j] as number[])[i] = v;
    }
  }
  return w;
}

const W = (w: number[][], i: number, j: number) => (w[i] as number[])[j] as number;

/** Maximum-weight perfect matching on an even number of nodes by DP over subsets. */
export function exactMatching(w: number[][]): [number, number][] {
  const n = w.length;
  if (n % 2) throw new Error('exactMatching needs an even number of nodes');
  if (n === 0) return [];
  const full = (1 << n) - 1;
  const best = new Float64Array(1 << n).fill(NaN);
  const choice = new Int8Array(1 << n);
  best[full] = 0;
  // Process masks from most to fewest set bits: best[mask] is the best for the nodes not in mask.
  const solve = (mask: number): number => {
    const hit = best[mask] as number;
    if (!Number.isNaN(hit)) return hit;
    let i = 0;
    while (mask & (1 << i)) i++;
    let b = -Infinity;
    let c = -1;
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      const v = W(w, i, j) + solve(mask | (1 << i) | (1 << j));
      if (v > b) {
        b = v;
        c = j;
      }
    }
    best[mask] = b;
    choice[mask] = c;
    return b;
  };
  solve(0);
  const pairs: [number, number][] = [];
  let mask = 0;
  while (mask !== full) {
    let i = 0;
    while (mask & (1 << i)) i++;
    const j = choice[mask] as number;
    pairs.push([i, j]);
    mask |= (1 << i) | (1 << j);
  }
  return pairs;
}

/** Greedy matching by descending weight, then pair swaps until no swap helps. */
export function localMatching(w: number[][]): [number, number][] {
  const n = w.length;
  if (n % 2) throw new Error('localMatching needs an even number of nodes');
  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([W(w, i, j), i, j]);
  edges.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const used = new Array<boolean>(n).fill(false);
  const pairs: [number, number][] = [];
  for (const [, i, j] of edges) {
    if (used[i] || used[j]) continue;
    used[i] = used[j] = true;
    pairs.push([i, j]);
  }
  for (let round = 0, improved = true; improved && round < 200; round++) {
    improved = false;
    for (let p = 0; p < pairs.length; p++) {
      for (let q = p + 1; q < pairs.length; q++) {
        const [a, b] = pairs[p] as [number, number];
        const [c, d] = pairs[q] as [number, number];
        const now = W(w, a, b) + W(w, c, d);
        const s1 = W(w, a, c) + W(w, b, d);
        const s2 = W(w, a, d) + W(w, b, c);
        if (s1 > now + 1e-12 && s1 >= s2) {
          pairs[p] = [a, c];
          pairs[q] = [b, d];
          improved = true;
        } else if (s2 > now + 1e-12) {
          pairs[p] = [a, d];
          pairs[q] = [b, c];
          improved = true;
        }
      }
    }
  }
  return pairs;
}

export function matchingWeight(w: number[][], pairs: [number, number][]): number {
  return pairs.reduce((s, [i, j]) => s + W(w, i, j), 0);
}

/**
 * Study groups: pairs, plus one trio when the class size is odd. The odd
 * student out is found by matching against a zero-weight placeholder, then
 * joins the pair they add the most to.
 */
export function makeGroups(ps: Profile[], topics: string[], opts: MatchOptions): { groups: Group[]; exact: boolean } {
  const n = ps.length;
  if (n === 0) return { groups: [], exact: true };
  if (n === 1) return { groups: [{ members: [0], score: 0, help: [], sharedGaps: [] }], exact: true };
  const w = weights(ps, topics, opts);
  const odd = n % 2 === 1;
  const ww = odd ? [...w.map((r) => [...r, 0]), new Array<number>(n + 1).fill(0)] : w;
  const exact = ww.length <= (opts.exactLimit ?? 20);
  let pairs = exact ? exactMatching(ww) : localMatching(ww);
  let groupsIdx: number[][] = [];
  if (odd) {
    const loner = pairs.find(([i, j]) => i === n || j === n) as [number, number];
    const x = loner[0] === n ? loner[1] : loner[0];
    pairs = pairs.filter((p) => p !== loner);
    let bestK = 0;
    let bestGain = -Infinity;
    pairs.forEach(([a, b], k) => {
      const g = W(w, x, a) + W(w, x, b);
      if (g > bestGain) {
        bestGain = g;
        bestK = k;
      }
    });
    groupsIdx = pairs.map((p, k) => (k === bestK ? [...p, x] : [...p]));
  } else groupsIdx = pairs.map((p) => [...p]);
  const groups = groupsIdx.map((members) => describeGroup(ps, members.sort((a, b) => a - b), topics, opts));
  groups.sort((a, b) => (a.members[0] as number) - (b.members[0] as number));
  return { groups, exact };
}

export function describeGroup(ps: Profile[], members: number[], topics: string[], opts: MatchOptions): Group {
  let score = 0;
  const help: Help[] = [];
  const sharedGaps = new Set<string>();
  for (let x = 0; x < members.length; x++) {
    for (let y = x + 1; y < members.length; y++) {
      const s = pairScore(ps, members[x] as number, members[y] as number, topics, opts);
      score += s.score;
      help.push(...s.help);
    }
  }
  for (const t of topics) {
    const lv = members.map((m) => level((ps[m] as Profile).mastery.get(t), opts.thresholds));
    if (!lv.includes('strong') && lv.includes('gap')) sharedGaps.add(t);
  }
  return { members, score, help, sharedGaps: topics.filter((t) => sharedGaps.has(t)) };
}

/** Score of random pairings, for comparison: the mean over `trials` seeded shuffles. */
export function randomBaseline(ps: Profile[], topics: string[], opts: MatchOptions, trials = 50, seed = 1): number {
  let a = seed >>> 0 || 1;
  const rand = () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
  const n = ps.length;
  if (n < 2) return 0;
  const w = weights(ps, topics, opts);
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j] as number, order[i] as number];
    }
    for (let k = 0; k + 1 < n; k += 2) total += W(w, order[k] as number, order[k + 1] as number);
    if (n % 2) total += W(w, order[n - 1] as number, order[0] as number) + W(w, order[n - 1] as number, order[1] as number);
  }
  return total / trials;
}
