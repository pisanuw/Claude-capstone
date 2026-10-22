// Step 2: assign every node to a layer (rank) so that each edge v -> w has
// rank(w) - rank(v) >= minlen. Longest-path is fast but stretches edges;
// network simplex (Gansner, Koutsofios, North and Vo, 1993) minimises the total
// weighted edge length sum(weight * (rank(w) - rank(v))) exactly.

import type { WEdge } from './acyclic';

function topoOrder(nodes: string[], edges: WEdge[]): string[] {
  const indeg = new Map<string, number>(nodes.map((n) => [n, 0]));
  const out = new Map<string, WEdge[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    indeg.set(e.w, indeg.get(e.w)! + 1);
    out.get(e.v)!.push(e);
  }
  const queue = nodes.filter((n) => indeg.get(n) === 0);
  const order: string[] = [];
  for (let k = 0; k < queue.length; k++) {
    const n = queue[k];
    order.push(n);
    for (const e of out.get(n)!) {
      const d = indeg.get(e.w)! - 1;
      indeg.set(e.w, d);
      if (d === 0) queue.push(e.w);
    }
  }
  if (order.length !== nodes.length) throw new Error('rank: graph has a cycle; run cycle removal first');
  return order;
}

/** Every source on rank 0, every other node as low as its longest incoming path. */
export function longestPath(nodes: string[], edges: WEdge[]): Map<string, number> {
  const rank = new Map<string, number>(nodes.map((n) => [n, 0]));
  const inE = new Map<string, WEdge[]>(nodes.map((n) => [n, []]));
  for (const e of edges) inE.get(e.w)!.push(e);
  for (const n of topoOrder(nodes, edges)) {
    let r = 0;
    for (const e of inE.get(n)!) r = Math.max(r, rank.get(e.v)! + e.minlen);
    rank.set(n, r);
  }
  return rank;
}

export function slack(rank: Map<string, number>, e: WEdge): number {
  return rank.get(e.w)! - rank.get(e.v)! - e.minlen;
}

/** Weighted total edge length, the quantity network simplex minimises. */
export function totalLength(rank: Map<string, number>, edges: WEdge[]): number {
  return edges.reduce((s, e) => s + e.weight * (rank.get(e.w)! - rank.get(e.v)!), 0);
}

function components(nodes: string[], edges: WEdge[]): string[][] {
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    adj.get(e.v)!.push(e.w);
    adj.get(e.w)!.push(e.v);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n)) continue;
    const comp: string[] = [];
    const stack = [n];
    seen.add(n);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const y of adj.get(x)!) {
        if (!seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

function normalize(rank: Map<string, number>, nodes: string[]): void {
  let min = Infinity;
  for (const n of nodes) min = Math.min(min, rank.get(n)!);
  for (const n of nodes) rank.set(n, rank.get(n)! - min);
}

export function networkSimplex(nodes: string[], edges: WEdge[], maxIterations = 2000): Map<string, number> {
  const rank = longestPath(nodes, edges);
  const compOf = new Map<string, number>();
  const comps = components(nodes, edges);
  comps.forEach((c, k) => c.forEach((n) => compOf.set(n, k)));
  const byComp: WEdge[][] = comps.map(() => []);
  for (const e of edges) byComp[compOf.get(e.v)!].push(e);
  comps.forEach((c, k) => {
    if (c.length > 1) simplexComponent(c, byComp[k], rank, maxIterations);
    normalize(rank, c);
  });
  return rank;
}

function simplexComponent(nodes: string[], edges: WEdge[], rank: Map<string, number>, maxIterations: number): void {
  const inTree = new Set<string>([nodes[0]]);
  const tree = new Set<WEdge>();

  // Feasible tight spanning tree: grow along tight edges, and when stuck shift
  // the whole tree by the smallest slack of an edge leaving it.
  const grow = (): void => {
    let added = true;
    while (added) {
      added = false;
      for (const e of edges) {
        const a = inTree.has(e.v);
        const b = inTree.has(e.w);
        if (a !== b && slack(rank, e) === 0) {
          inTree.add(a ? e.w : e.v);
          tree.add(e);
          added = true;
        }
      }
    }
  };
  grow();
  while (inTree.size < nodes.length) {
    let best: WEdge | null = null;
    let bestSlack = Infinity;
    for (const e of edges) {
      if (inTree.has(e.v) !== inTree.has(e.w)) {
        const s = slack(rank, e);
        if (s < bestSlack) {
          bestSlack = s;
          best = e;
        }
      }
    }
    const delta = inTree.has(best!.v) ? bestSlack : -bestSlack;
    for (const n of inTree) rank.set(n, rank.get(n)! + delta);
    grow();
  }

  const treeAdj = (): Map<string, WEdge[]> => {
    const adj = new Map<string, WEdge[]>(nodes.map((n) => [n, []]));
    for (const e of tree) {
      adj.get(e.v)!.push(e);
      adj.get(e.w)!.push(e);
    }
    return adj;
  };

  /** Nodes on the tail side once tree edge `cut` is removed. */
  const tailSide = (adj: Map<string, WEdge[]>, cut: WEdge): Set<string> => {
    const side = new Set<string>([cut.v]);
    const stack = [cut.v];
    while (stack.length) {
      const x = stack.pop()!;
      for (const e of adj.get(x)!) {
        if (e === cut) continue;
        const y = e.v === x ? e.w : e.v;
        if (!side.has(y)) {
          side.add(y);
          stack.push(y);
        }
      }
    }
    return side;
  };

  const reRank = (): void => {
    const adj = treeAdj();
    const root = nodes[0];
    const done = new Set<string>([root]);
    const stack = [root];
    rank.set(root, 0);
    while (stack.length) {
      const x = stack.pop()!;
      for (const e of adj.get(x)!) {
        const y = e.v === x ? e.w : e.v;
        if (done.has(y)) continue;
        rank.set(y, e.v === x ? rank.get(x)! + e.minlen : rank.get(x)! - e.minlen);
        done.add(y);
        stack.push(y);
      }
    }
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    const adj = treeAdj();
    let leave: WEdge | null = null;
    let leaveSide: Set<string> | null = null;
    let worst = 0;
    for (const t of tree) {
      const side = tailSide(adj, t);
      let cut = 0;
      for (const e of edges) {
        const a = side.has(e.v);
        const b = side.has(e.w);
        if (a && !b) cut += e.weight;
        else if (!a && b) cut -= e.weight;
      }
      if (cut < worst) {
        worst = cut;
        leave = t;
        leaveSide = side;
      }
    }
    if (!leave || !leaveSide) break;
    let enter: WEdge | null = null;
    let enterSlack = Infinity;
    for (const e of edges) {
      if (tree.has(e)) continue;
      if (!leaveSide.has(e.v) && leaveSide.has(e.w)) {
        const s = slack(rank, e);
        if (s < enterSlack) {
          enterSlack = s;
          enter = e;
        }
      }
    }
    // A negative cut value guarantees an edge from the head side to the tail side.
    tree.delete(leave);
    tree.add(enter!);
    reRank();
  }
}
