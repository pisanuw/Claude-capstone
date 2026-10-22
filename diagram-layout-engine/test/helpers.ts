import type { WEdge } from '../src/core/acyclic';
import { mulberry32 } from '../src/core/bench';

export function wedges(pairs: [string, string][], minlen = 1): WEdge[] {
  return pairs.map(([v, w], k) => ({ id: `e${k}`, v, w, weight: 1, minlen }));
}

export function nodesOf(pairs: [string, string][]): string[] {
  return [...new Set(pairs.flat())];
}

/** Random DAG on n nodes named n0..n{n-1}. */
export function randomDag(seed: number, n: number, p: number): { nodes: string[]; edges: WEdge[] } {
  const rng = mulberry32(seed);
  const nodes = Array.from({ length: n }, (_, k) => `n${k}`);
  const pairs: [string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rng() < p) pairs.push([nodes[i], nodes[j]]);
  return { nodes, edges: wedges(pairs) };
}

/** Does the edge list (with the given reversals applied) contain a cycle? */
export function hasCycle(nodes: string[], edges: WEdge[]): boolean {
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) out.get(e.v)!.push(e.w);
  const state = new Map<string, number>();
  const visit = (n: string): boolean => {
    state.set(n, 1);
    for (const m of out.get(n)!) {
      if (state.get(m) === 1) return true;
      if (!state.has(m) && visit(m)) return true;
    }
    state.set(n, 2);
    return false;
  };
  return nodes.some((n) => !state.has(n) && visit(n));
}
