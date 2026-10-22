// Step 5: horizontal coordinates inside the fixed layer order. Two methods:
//
// * Brandes-Koepf (2001): four vertical alignments (up/down x left/right)
//   built from median neighbours, each compacted into blocks, then balanced by
//   taking the average of the two median candidates per node. Long edges end
//   up straight because inner segments (dummy to dummy) win alignment
//   conflicts.
// * Priority method (Sugiyama, Tagawa and Toda, 1981): repeated sweeps move
//   each node towards the mean of its neighbours in priority order (dummies
//   first, then by degree), pushing lower-priority nodes aside.

import type { PEdge } from './order';

export interface PNode {
  width: number;
  dummy: boolean;
  /** Extra room on the right of the node (self-loops). */
  padRight: number;
}

export interface PositionInput {
  layers: string[][];
  nodes: Map<string, PNode>;
  edges: PEdge[];
  nodeSep: number;
  edgeSep: number;
}

export function separation(input: PositionInput, left: string, right: string): number {
  const a = input.nodes.get(left)!;
  const b = input.nodes.get(right)!;
  const gap = a.dummy && b.dummy ? input.edgeSep : a.dummy || b.dummy ? (input.nodeSep + input.edgeSep) / 2 : input.nodeSep;
  return a.width / 2 + a.padRight + b.width / 2 + gap;
}

function neighbours(input: PositionInput): { preds: Map<string, string[]>; succs: Map<string, string[]> } {
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const l of input.layers) for (const n of l) {
    preds.set(n, []);
    succs.set(n, []);
  }
  for (const e of input.edges) {
    succs.get(e.v)!.push(e.w);
    preds.get(e.w)!.push(e.v);
  }
  return { preds, succs };
}

const key = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Type 1 conflicts: a non-inner segment crossing an inner (dummy-dummy) segment. */
export function type1Conflicts(input: PositionInput, preds: Map<string, string[]>): Set<string> {
  const conflicts = new Set<string>();
  const dummy = (n: string): boolean => input.nodes.get(n)!.dummy;
  for (let r = 1; r < input.layers.length; r++) {
    const prev = input.layers[r - 1];
    const layer = input.layers[r];
    const pos = new Map(prev.map((n, k) => [n, k]));
    let k0 = 0;
    let scan = 0;
    const last = layer[layer.length - 1];
    layer.forEach((v, i) => {
      const inner = dummy(v) ? preds.get(v)!.find((u) => dummy(u)) : undefined;
      const k1 = inner !== undefined ? pos.get(inner)! : prev.length;
      if (inner !== undefined || v === last) {
        for (const s of layer.slice(scan, i + 1)) {
          for (const u of preds.get(s)!) {
            const p = pos.get(u)!;
            if ((p < k0 || k1 < p) && !(dummy(u) && dummy(s))) conflicts.add(key(u, s));
          }
        }
        scan = i + 1;
        k0 = k1;
      }
    });
  }
  return conflicts;
}

function verticalAlignment(
  layering: string[][],
  conflicts: Set<string>,
  neighbourFn: (v: string) => string[],
): { root: Map<string, string>; align: Map<string, string> } {
  const root = new Map<string, string>();
  const align = new Map<string, string>();
  const pos = new Map<string, number>();
  for (const layer of layering) {
    layer.forEach((v, k) => {
      root.set(v, v);
      align.set(v, v);
      pos.set(v, k);
    });
  }
  for (const layer of layering) {
    let prevIdx = -1;
    for (const v of layer) {
      const ws = [...neighbourFn(v)].sort((a, b) => pos.get(a)! - pos.get(b)!);
      if (!ws.length) continue;
      const mp = (ws.length - 1) / 2;
      for (let i = Math.floor(mp); i <= Math.ceil(mp); i++) {
        const w = ws[i];
        if (align.get(v) === v && prevIdx < pos.get(w)! && !conflicts.has(key(v, w))) {
          align.set(w, v);
          root.set(v, root.get(w)!);
          align.set(v, root.get(v)!);
          prevIdx = pos.get(w)!;
        }
      }
    }
  }
  return { root, align };
}

function horizontalCompaction(
  input: PositionInput,
  layering: string[][],
  root: Map<string, string>,
  mirrored: boolean,
): Map<string, number> {
  // Block graph: one node per block root, an edge between neighbouring blocks.
  const blockIn = new Map<string, Map<string, number>>();
  const blockOut = new Map<string, Map<string, number>>();
  const blocks: string[] = [];
  const touch = (b: string): void => {
    if (!blockIn.has(b)) {
      blockIn.set(b, new Map());
      blockOut.set(b, new Map());
      blocks.push(b);
    }
  };
  for (const layer of layering) {
    let u: string | undefined;
    for (const v of layer) {
      const rv = root.get(v)!;
      touch(rv);
      if (u !== undefined) {
        const ru = root.get(u)!;
        const s = mirrored ? separation(input, v, u) : separation(input, u, v);
        const prev = blockOut.get(ru)!.get(rv) ?? 0;
        blockOut.get(ru)!.set(rv, Math.max(prev, s));
        blockIn.get(rv)!.set(ru, Math.max(prev, s));
      }
      u = v;
    }
  }
  // Kahn's algorithm gives a topological order of the (acyclic) block graph.
  const indeg = new Map(blocks.map((b) => [b, blockIn.get(b)!.size]));
  const topo: string[] = blocks.filter((b) => indeg.get(b) === 0);
  for (let k = 0; k < topo.length; k++) {
    for (const c of blockOut.get(topo[k])!.keys()) {
      const d = indeg.get(c)! - 1;
      indeg.set(c, d);
      if (d === 0) topo.push(c);
    }
  }
  const xs = new Map<string, number>();
  for (const b of topo) {
    let x = 0;
    for (const [a, w] of blockIn.get(b)!) x = Math.max(x, xs.get(a)! + w);
    xs.set(b, x);
  }
  // Second pass pulls blocks right towards their successors to close gaps.
  for (let k = topo.length - 1; k >= 0; k--) {
    const b = topo[k];
    let min = Infinity;
    for (const [c, w] of blockOut.get(b)!) min = Math.min(min, xs.get(c)! - w);
    if (min !== Infinity) xs.set(b, Math.max(xs.get(b)!, min));
  }
  const out = new Map<string, number>();
  for (const v of root.keys()) out.set(v, xs.get(root.get(v)!)!);
  return out;
}

function enforceSeparation(input: PositionInput, xs: Map<string, number>): void {
  for (const layer of input.layers) {
    for (let k = 1; k < layer.length; k++) {
      const min = xs.get(layer[k - 1])! + separation(input, layer[k - 1], layer[k]);
      if (xs.get(layer[k])! < min) xs.set(layer[k], min);
    }
  }
}

export function brandesKopf(input: PositionInput): Map<string, number> {
  const { preds, succs } = neighbours(input);
  const conflicts = type1Conflicts(input, preds);
  const all: Map<string, number>[] = [];
  for (const vert of ['u', 'd'] as const) {
    const base = vert === 'u' ? input.layers : [...input.layers].reverse();
    for (const horiz of ['l', 'r'] as const) {
      const layering = horiz === 'l' ? base : base.map((l) => [...l].reverse());
      const nf = vert === 'u' ? (v: string) => preds.get(v)! : (v: string) => succs.get(v)!;
      const { root } = verticalAlignment(layering, conflicts, nf);
      let xs = horizontalCompaction(input, layering, root, horiz === 'r');
      if (horiz === 'r') xs = new Map([...xs].map(([v, x]) => [v, -x]));
      all.push(xs);
    }
  }
  // Align the four layouts to the narrowest one, then take the average median.
  const width = (xs: Map<string, number>): { lo: number; hi: number } => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [v, x] of xs) {
      const w = input.nodes.get(v)!.width / 2;
      lo = Math.min(lo, x - w);
      hi = Math.max(hi, x + w);
    }
    return { lo, hi };
  };
  const extents = all.map(width);
  let smallest = 0;
  extents.forEach((e, k) => {
    if (e.hi - e.lo < extents[smallest].hi - extents[smallest].lo) smallest = k;
  });
  const target = extents[smallest];
  all.forEach((xs, k) => {
    if (k === smallest) return;
    // Indices 0, 2 are left alignments, 1, 3 right alignments.
    const delta = k % 2 === 0 ? target.lo - extents[k].lo : target.hi - extents[k].hi;
    for (const [v, x] of xs) xs.set(v, x + delta);
  });
  const out = new Map<string, number>();
  for (const v of all[0].keys()) {
    const s = all.map((xs) => xs.get(v)!).sort((a, b) => a - b);
    out.set(v, (s[1] + s[2]) / 2);
  }
  // Balancing can let neighbours drift a few px closer than allowed; fix that.
  enforceSeparation(input, out);
  return out;
}

export function priorityLayout(input: PositionInput, rounds = 4): Map<string, number> {
  const { preds, succs } = neighbours(input);
  const xs = new Map<string, number>();
  // Start with every layer packed left and centred on 0.
  for (const layer of input.layers) {
    let x = 0;
    layer.forEach((v, k) => {
      if (k > 0) x += separation(input, layer[k - 1], v);
      xs.set(v, x);
    });
    const shift = x / 2;
    for (const v of layer) xs.set(v, xs.get(v)! - shift);
  }
  const place = (layer: string[], nb: Map<string, string[]>): void => {
    const x = layer.map((v) => xs.get(v)!);
    const locked = new Array<boolean>(layer.length).fill(false);
    const prio = layer.map((v, k) => ({ k, p: input.nodes.get(v)!.dummy ? 1e6 : nb.get(v)!.length }));
    prio.sort((a, b) => b.p - a.p || a.k - b.k);
    const sep = (k: number): number => separation(input, layer[k], layer[k + 1]);
    for (const { k } of prio) {
      const ns = nb.get(layer[k])!;
      if (!ns.length) {
        locked[k] = true;
        continue;
      }
      const target = ns.reduce((s, n) => s + xs.get(n)!, 0) / ns.length;
      if (target < x[k]) {
        let avail = Infinity;
        let slackSum = 0;
        for (let j = k - 1; j >= 0; j--) {
          slackSum += x[j + 1] - x[j] - sep(j);
          if (locked[j]) {
            avail = slackSum;
            break;
          }
        }
        x[k] -= Math.max(0, Math.min(x[k] - target, avail));
        for (let j = k - 1; j >= 0; j--) x[j] = Math.min(x[j], x[j + 1] - sep(j));
      } else if (target > x[k]) {
        let avail = Infinity;
        let slackSum = 0;
        for (let j = k + 1; j < layer.length; j++) {
          slackSum += x[j] - x[j - 1] - sep(j - 1);
          if (locked[j]) {
            avail = slackSum;
            break;
          }
        }
        x[k] += Math.max(0, Math.min(target - x[k], avail));
        for (let j = k + 1; j < layer.length; j++) x[j] = Math.max(x[j], x[j - 1] + sep(j - 1));
      }
      locked[k] = true;
    }
    layer.forEach((v, k) => xs.set(v, x[k]));
  };
  for (let round = 0; round < rounds; round++) {
    for (let r = 1; r < input.layers.length; r++) place(input.layers[r], preds);
    for (let r = input.layers.length - 2; r >= 0; r--) place(input.layers[r], succs);
  }
  return xs;
}
