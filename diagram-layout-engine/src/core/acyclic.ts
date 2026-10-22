// Step 1 of the Sugiyama pipeline: make the graph acyclic by reversing a small
// set of edges (a feedback arc set). Finding the minimum set is NP-hard; the
// greedy heuristic of Eades, Lin and Smyth (1993) runs in linear time on
// sparse graphs and reverses at most m/2 - n/6 edges.

export interface WEdge {
  id: string;
  v: string;
  w: string;
  weight: number;
  minlen: number;
}

/** Edge ids whose direction should be reversed. Self-loops must already be removed. */
export function feedbackEdges(nodes: string[], edges: WEdge[], method: 'greedy' | 'dfs'): Set<string> {
  return method === 'dfs' ? dfsFeedback(nodes, edges) : greedyFeedback(nodes, edges);
}

function greedyFeedback(nodes: string[], edges: WEdge[]): Set<string> {
  const outW = new Map<string, number>();
  const inW = new Map<string, number>();
  const outE = new Map<string, WEdge[]>();
  const inE = new Map<string, WEdge[]>();
  for (const n of nodes) {
    outW.set(n, 0);
    inW.set(n, 0);
    outE.set(n, []);
    inE.set(n, []);
  }
  for (const e of edges) {
    outW.set(e.v, outW.get(e.v)! + e.weight);
    inW.set(e.w, inW.get(e.w)! + e.weight);
    outE.get(e.v)!.push(e);
    inE.get(e.w)!.push(e);
  }
  const alive = new Set(nodes);
  const remove = (n: string): void => {
    alive.delete(n);
    for (const e of outE.get(n)!) if (alive.has(e.w)) inW.set(e.w, inW.get(e.w)! - e.weight);
    for (const e of inE.get(n)!) if (alive.has(e.v)) outW.set(e.v, outW.get(e.v)! - e.weight);
  };
  const s1: string[] = [];
  const s2: string[] = [];
  while (alive.size) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of [...alive]) {
        if (alive.has(n) && outW.get(n)! <= 0) {
          s2.push(n);
          remove(n);
          changed = true;
        }
      }
      for (const n of [...alive]) {
        if (alive.has(n) && inW.get(n)! <= 0) {
          s1.push(n);
          remove(n);
          changed = true;
        }
      }
    }
    if (!alive.size) break;
    let best = '';
    let bestDelta = -Infinity;
    for (const n of alive) {
      const d = outW.get(n)! - inW.get(n)!;
      if (d > bestDelta) {
        bestDelta = d;
        best = n;
      }
    }
    s1.push(best);
    remove(best);
  }
  const order = [...s1, ...s2.reverse()];
  const pos = new Map(order.map((n, k) => [n, k]));
  const out = new Set<string>();
  for (const e of edges) if (pos.get(e.v)! > pos.get(e.w)!) out.add(e.id);
  return out;
}

function dfsFeedback(nodes: string[], edges: WEdge[]): Set<string> {
  const outE = new Map<string, WEdge[]>(nodes.map((n) => [n, []]));
  for (const e of edges) outE.get(e.v)!.push(e);
  const state = new Map<string, 1 | 2>();
  const out = new Set<string>();
  for (const root of nodes) {
    if (state.has(root)) continue;
    // Iterative DFS so deep chains cannot overflow the stack.
    const stack: { n: string; k: number }[] = [{ n: root, k: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = outE.get(top.n)!;
      if (top.k >= list.length) {
        state.set(top.n, 2);
        stack.pop();
        continue;
      }
      const e = list[top.k++];
      const s = state.get(e.w);
      if (s === 1) out.add(e.id);
      else if (s === undefined) {
        state.set(e.w, 1);
        stack.push({ n: e.w, k: 0 });
      }
    }
  }
  return out;
}
