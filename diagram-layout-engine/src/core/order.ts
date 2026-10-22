// Step 4: order the nodes inside each layer to reduce edge crossings. Even the
// two-layer version is NP-hard, so this uses layer-by-layer sweeps with the
// barycenter or weighted-median heuristic, optional adjacent transposition,
// and keeps the best ordering seen. Crossings are counted with the
// accumulator tree of Barth, Juenger and Mutzel (2004).

import type { OrderSnapshot } from './types';

export interface PEdge {
  v: string;
  w: string;
  weight: number;
}

/** Weighted crossings between two adjacent layers. `edges` go from north to south. */
export function bilayerCrossings(north: string[], south: string[], edges: PEdge[]): number {
  if (!south.length || !north.length) return 0;
  const nPos = new Map(north.map((n, k) => [n, k]));
  const sPos = new Map(south.map((n, k) => [n, k]));
  const entries = edges
    .filter((e) => nPos.has(e.v) && sPos.has(e.w))
    .map((e) => ({ a: nPos.get(e.v)!, b: sPos.get(e.w)!, weight: e.weight }))
    .sort((p, q) => p.a - q.a || p.b - q.b);
  let first = 1;
  while (first < south.length) first <<= 1;
  const tree = new Array<number>(2 * first - 1).fill(0);
  first -= 1;
  let cc = 0;
  for (const { b, weight } of entries) {
    let index = b + first;
    tree[index] += weight;
    let sum = 0;
    while (index > 0) {
      if (index % 2) sum += tree[index + 1];
      index = (index - 1) >> 1;
      tree[index] += weight;
    }
    cc += weight * sum;
  }
  return cc;
}

export class LayerAdjacency {
  readonly up = new Map<string, PEdge[]>();
  readonly down = new Map<string, PEdge[]>();
  readonly between: PEdge[][];

  constructor(
    layers: string[][],
    readonly edges: PEdge[],
  ) {
    const rank = new Map<string, number>();
    layers.forEach((l, r) => l.forEach((n) => rank.set(n, r)));
    for (const l of layers) for (const n of l) {
      this.up.set(n, []);
      this.down.set(n, []);
    }
    this.between = layers.map(() => []);
    for (const e of edges) {
      this.down.get(e.v)!.push(e);
      this.up.get(e.w)!.push(e);
      this.between[rank.get(e.v)!].push(e);
    }
  }

  crossings(layers: string[][]): number {
    let c = 0;
    for (let r = 0; r + 1 < layers.length; r++) c += bilayerCrossings(layers[r], layers[r + 1], this.between[r]);
    return c;
  }
}

/** Initial order: depth-first from nodes in rank order, as in dot. */
export function initialOrder(layers: string[][], adj: LayerAdjacency): string[][] {
  const rank = new Map<string, number>();
  layers.forEach((l, r) => l.forEach((n) => rank.set(n, r)));
  const out: string[][] = layers.map(() => []);
  const seen = new Set<string>();
  const all = layers.flat();
  for (const start of all) {
    if (seen.has(start)) continue;
    const stack = [start];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      out[rank.get(n)!].push(n);
      const next = adj.down.get(n)!.map((e) => e.w);
      for (let k = next.length - 1; k >= 0; k--) if (!seen.has(next[k])) stack.push(next[k]);
    }
  }
  return out;
}

function weightedMedian(positions: number[]): number {
  const p = [...positions].sort((a, b) => a - b);
  const m = Math.floor(p.length / 2);
  if (p.length % 2 === 1) return p[m];
  if (p.length === 2) return (p[0] + p[1]) / 2;
  const left = p[m - 1] - p[0];
  const right = p[p.length - 1] - p[m];
  if (left + right === 0) return (p[m - 1] + p[m]) / 2;
  return (p[m - 1] * right + p[m] * left) / (left + right);
}

function barycenter(edges: PEdge[], pos: Map<string, number>, key: 'v' | 'w'): number {
  let s = 0;
  let w = 0;
  for (const e of edges) {
    s += e.weight * pos.get(e[key])!;
    w += e.weight;
  }
  return s / w;
}

/**
 * Reorder `layer` by the heuristic value of each node against the fixed
 * neighbouring layer. Nodes with no neighbours there keep their slot.
 */
function sortLayer(layer: string[], fixed: string[], adjFor: Map<string, PEdge[]>, key: 'v' | 'w', method: 'barycenter' | 'median'): string[] {
  const pos = new Map(fixed.map((n, k) => [n, k]));
  const valued: { n: string; val: number; k: number }[] = [];
  const pinned = new Map<number, string>();
  layer.forEach((n, k) => {
    const es = adjFor.get(n)!.filter((e) => pos.has(e[key]));
    if (!es.length) {
      pinned.set(k, n);
      return;
    }
    const val = method === 'median' ? weightedMedian(es.map((e) => pos.get(e[key])!)) : barycenter(es, pos, key);
    valued.push({ n, val, k });
  });
  valued.sort((a, b) => a.val - b.val || a.k - b.k);
  const out: string[] = [];
  let vi = 0;
  for (let k = 0; k < layer.length; k++) out.push(pinned.get(k) ?? valued[vi++].n);
  return out;
}

/** Crossings between edges of u and edges of v (u left of v) against one fixed layer. */
function pairCrossings(u: string, v: string, adj: Map<string, PEdge[]>, pos: Map<string, number>, key: 'v' | 'w'): number {
  let c = 0;
  for (const a of adj.get(u)!) {
    const pa = pos.get(a[key]);
    if (pa === undefined) continue;
    for (const b of adj.get(v)!) {
      const pb = pos.get(b[key]);
      if (pb !== undefined && pa > pb) c += a.weight * b.weight;
    }
  }
  return c;
}

/** Swap adjacent nodes while that strictly lowers crossings with both neighbouring layers. */
export function transpose(layers: string[][], adj: LayerAdjacency, maxRounds = 30): void {
  for (let round = 0; round < maxRounds; round++) {
    let improved = false;
    for (let r = 0; r < layers.length; r++) {
      const layer = layers[r];
      const above = r > 0 ? new Map(layers[r - 1].map((n, k) => [n, k])) : null;
      const below = r + 1 < layers.length ? new Map(layers[r + 1].map((n, k) => [n, k])) : null;
      for (let k = 0; k + 1 < layer.length; k++) {
        const u = layer[k];
        const v = layer[k + 1];
        let keep = 0;
        let swap = 0;
        if (above) {
          keep += pairCrossings(u, v, adj.up, above, 'v');
          swap += pairCrossings(v, u, adj.up, above, 'v');
        }
        if (below) {
          keep += pairCrossings(u, v, adj.down, below, 'w');
          swap += pairCrossings(v, u, adj.down, below, 'w');
        }
        if (swap < keep) {
          layer[k] = v;
          layer[k + 1] = u;
          improved = true;
        }
      }
    }
    if (!improved) return;
  }
}

export interface OrderOptions {
  method: 'barycenter' | 'median';
  transpose: boolean;
  sweeps: number;
}

export interface OrderResult {
  layers: string[][];
  crossings: number;
  snapshots: OrderSnapshot[];
  best: number;
}

const copy = (layers: string[][]): string[][] => layers.map((l) => [...l]);

export function minimizeCrossings(layers: string[][], edges: PEdge[], opts: OrderOptions, record = false): OrderResult {
  const adj = new LayerAdjacency(layers, edges);
  const cur = initialOrder(layers, adj);
  let bestLayers = copy(cur);
  let best = adj.crossings(cur);
  const snapshots: OrderSnapshot[] = [];
  let bestIndex = 0;
  const snap = (label: string, crossings: number): void => {
    if (record) snapshots.push({ label, layers: copy(cur), crossings });
  };
  snap('initial DFS order', best);
  let stale = 0;
  for (let i = 0; i < opts.sweeps * 2 && best > 0; i++) {
    const down = i % 2 === 0;
    if (down) {
      for (let r = 1; r < cur.length; r++) cur[r] = sortLayer(cur[r], cur[r - 1], adj.up, 'v', opts.method);
    } else {
      for (let r = cur.length - 2; r >= 0; r--) cur[r] = sortLayer(cur[r], cur[r + 1], adj.down, 'w', opts.method);
    }
    let c = adj.crossings(cur);
    snap(`sweep ${Math.floor(i / 2) + 1} ${down ? 'down' : 'up'} (${opts.method})`, c);
    if (opts.transpose) {
      transpose(cur, adj);
      const t = adj.crossings(cur);
      if (t !== c) {
        c = t;
        snap(`sweep ${Math.floor(i / 2) + 1} ${down ? 'down' : 'up'} + transpose`, c);
      }
    }
    if (c < best) {
      best = c;
      bestLayers = copy(cur);
      bestIndex = snapshots.length - 1;
      stale = 0;
    } else if (++stale >= 4) break;
  }
  return { layers: bestLayers, crossings: best, snapshots, best: record ? bestIndex : -1 };
}
