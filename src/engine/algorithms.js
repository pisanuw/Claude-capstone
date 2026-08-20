// Search algorithms over the grid. Each algorithm is a generator that yields a
// uniform event trace the UI can play back one expansion at a time:
//
//   { type: 'start', algo, node, goal, seed: {g,h,f} }
//   { type: 'expand', algo, order, node, g, h, f, added, updated,
//     skippedVisited, skippedWorse, frontierSize }
//   { type: 'goal', algo, node, g }
//   { type: 'done', algo, found, path, steps, cost, expanded, maxFrontier }
//
// 'added' and 'updated' entries carry {r, c, g, h, f, mud} so the renderer and
// the narrator can both work from the same numbers the algorithm used.

import { idx, rc, neighbors, enterCost, manhattan, MUD } from './grid.js';
import { MinHeap } from './pqueue.js';

export const ALGORITHMS = {
  bfs: {
    key: 'bfs',
    name: 'Breadth-first search',
    short: 'BFS',
    orderedBy: 'queue age',
    usesWeights: false,
    usesHeuristic: false,
    guarantee: 'fewest steps',
  },
  dfs: {
    key: 'dfs',
    name: 'Depth-first search',
    short: 'DFS',
    orderedBy: 'stack depth',
    usesWeights: false,
    usesHeuristic: false,
    guarantee: null,
  },
  dijkstra: {
    key: 'dijkstra',
    name: 'Dijkstra',
    short: 'Dijkstra',
    orderedBy: 'cheapest g',
    usesWeights: true,
    usesHeuristic: false,
    guarantee: 'lowest cost',
  },
  greedy: {
    key: 'greedy',
    name: 'Greedy best-first',
    short: 'Greedy',
    orderedBy: 'lowest h',
    usesWeights: false,
    usesHeuristic: true,
    guarantee: null,
  },
  astar: {
    key: 'astar',
    name: 'A* search',
    short: 'A*',
    orderedBy: 'lowest f = g + h',
    usesWeights: true,
    usesHeuristic: true,
    guarantee: 'lowest cost',
  },
};

const GENERATORS = { bfs, dfs, dijkstra, greedy, astar };

// Runs an algorithm to completion and returns the full event array.
export function runAlgorithm(kind, grid) {
  const gen = GENERATORS[kind];
  if (!gen) throw new Error(`unknown algorithm: ${kind}`);
  return [...gen(grid)];
}

function nodeInfo(grid, r, c, g, h, f) {
  return { r, c, g, h, f, mud: grid.cells[idx(grid, r, c)] === MUD };
}

function buildPath(grid, came, t) {
  const path = [];
  for (let u = t; u !== -1; u = came[u]) path.push(rc(grid, u));
  path.reverse();
  let cost = 0;
  for (let i = 1; i < path.length; i++) cost += enterCost(grid, path[i].r, path[i].c);
  return { path, steps: path.length - 1, cost };
}

function doneFound(algo, grid, came, t, expanded, maxFrontier) {
  const { path, steps, cost } = buildPath(grid, came, t);
  return { type: 'done', algo, found: true, path, steps, cost, expanded, maxFrontier };
}

function doneNotFound(algo, expanded, maxFrontier) {
  return { type: 'done', algo, found: false, path: null, steps: null, cost: null, expanded, maxFrontier };
}

// Breadth-first search. FIFO queue, cells marked seen when enqueued.
// Guarantees the fewest steps; ignores terrain cost entirely.
function* bfs(grid) {
  const n = grid.cells.length;
  const s = idx(grid, grid.start.r, grid.start.c);
  const t = idx(grid, grid.goal.r, grid.goal.c);
  const came = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const q = [s];
  let qi = 0;
  seen[s] = 1;
  depth[s] = 0;
  let expanded = 0;
  let maxFrontier = 1;

  yield { type: 'start', algo: 'bfs', node: rc(grid, s), goal: rc(grid, t), seed: { g: 0, h: null, f: null } };

  while (qi < q.length) {
    const u = q[qi++];
    expanded++;
    const { r, c } = rc(grid, u);
    if (u === t) {
      yield { type: 'goal', algo: 'bfs', node: { r, c }, g: depth[u] };
      yield doneFound('bfs', grid, came, t, expanded, maxFrontier);
      return;
    }
    const added = [];
    let skippedVisited = 0;
    for (const nb of neighbors(grid, r, c)) {
      const v = idx(grid, nb.r, nb.c);
      if (seen[v]) {
        skippedVisited++;
        continue;
      }
      seen[v] = 1;
      came[v] = u;
      depth[v] = depth[u] + 1;
      q.push(v);
      added.push(nodeInfo(grid, nb.r, nb.c, depth[v], null, null));
    }
    const frontierSize = q.length - qi;
    maxFrontier = Math.max(maxFrontier, frontierSize);
    yield {
      type: 'expand', algo: 'bfs', order: expanded, node: { r, c },
      g: depth[u], h: null, f: null,
      added, updated: [], skippedVisited, skippedWorse: 0, frontierSize,
    };
  }
  yield doneNotFound('bfs', expanded, maxFrontier);
}

// Depth-first search. LIFO stack, cells marked seen when pushed. Neighbors are
// pushed in reverse so exploration prefers up, right, down, left. No guarantee
// of a short or cheap path.
function* dfs(grid) {
  const n = grid.cells.length;
  const s = idx(grid, grid.start.r, grid.start.c);
  const t = idx(grid, grid.goal.r, grid.goal.c);
  const came = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const stack = [s];
  seen[s] = 1;
  depth[s] = 0;
  let expanded = 0;
  let maxFrontier = 1;

  yield { type: 'start', algo: 'dfs', node: rc(grid, s), goal: rc(grid, t), seed: { g: 0, h: null, f: null } };

  while (stack.length > 0) {
    const u = stack.pop();
    expanded++;
    const { r, c } = rc(grid, u);
    if (u === t) {
      yield { type: 'goal', algo: 'dfs', node: { r, c }, g: depth[u] };
      yield doneFound('dfs', grid, came, t, expanded, maxFrontier);
      return;
    }
    const added = [];
    let skippedVisited = 0;
    const nbs = neighbors(grid, r, c);
    for (let i = nbs.length - 1; i >= 0; i--) {
      const nb = nbs[i];
      const v = idx(grid, nb.r, nb.c);
      if (seen[v]) {
        skippedVisited++;
        continue;
      }
      seen[v] = 1;
      came[v] = u;
      depth[v] = depth[u] + 1;
      stack.push(v);
      added.push(nodeInfo(grid, nb.r, nb.c, depth[v], null, null));
    }
    added.reverse(); // report in canonical up, right, down, left order
    maxFrontier = Math.max(maxFrontier, stack.length);
    yield {
      type: 'expand', algo: 'dfs', order: expanded, node: { r, c },
      g: depth[u], h: null, f: null,
      added, updated: [], skippedVisited, skippedWorse: 0, frontierSize: stack.length,
    };
  }
  yield doneNotFound('dfs', expanded, maxFrontier);
}

// Dijkstra and A* share a relaxation loop; A* just adds the heuristic to the
// heap priority. Uses lazy deletion: stale heap entries are skipped on pop.
function* costSearch(grid, algo) {
  const useH = algo === 'astar';
  const n = grid.cells.length;
  const s = idx(grid, grid.start.r, grid.start.c);
  const t = idx(grid, grid.goal.r, grid.goal.c);
  const goal = rc(grid, t);
  const came = new Int32Array(n).fill(-1);
  const dist = new Float64Array(n).fill(Infinity);
  const closed = new Uint8Array(n);
  const inOpen = new Uint8Array(n);
  const heap = new MinHeap();
  let tie = 0;
  let openCount = 0;
  let expanded = 0;
  let maxFrontier = 0;

  const hOf = (i) => manhattan(rc(grid, i), goal);

  dist[s] = 0;
  const h0 = useH ? hOf(s) : null;
  heap.push(useH ? [h0, h0, tie++] : [0, tie++], s);
  inOpen[s] = 1;
  openCount = 1;
  maxFrontier = 1;

  yield {
    type: 'start', algo, node: rc(grid, s), goal,
    seed: { g: 0, h: useH ? h0 : null, f: useH ? h0 : null },
  };

  while (heap.size() > 0) {
    const { value: u } = heap.pop();
    if (closed[u]) continue; // stale entry from a later relaxation
    closed[u] = 1;
    if (inOpen[u]) {
      inOpen[u] = 0;
      openCount--;
    }
    expanded++;
    const { r, c } = rc(grid, u);
    const gU = dist[u];
    const hU = useH ? hOf(u) : null;
    if (u === t) {
      yield { type: 'goal', algo, node: { r, c }, g: gU };
      yield doneFound(algo, grid, came, t, expanded, maxFrontier);
      return;
    }
    const added = [];
    const updated = [];
    let skippedVisited = 0;
    let skippedWorse = 0;
    for (const nb of neighbors(grid, r, c)) {
      const v = idx(grid, nb.r, nb.c);
      const cand = gU + enterCost(grid, nb.r, nb.c);
      if (closed[v]) {
        skippedVisited++;
        continue;
      }
      if (cand < dist[v]) {
        const isNew = dist[v] === Infinity;
        dist[v] = cand;
        came[v] = u;
        const hV = useH ? hOf(v) : null;
        const fV = useH ? cand + hV : null;
        heap.push(useH ? [fV, hV, tie++] : [cand, tie++], v);
        if (!inOpen[v]) {
          inOpen[v] = 1;
          openCount++;
        }
        (isNew ? added : updated).push(nodeInfo(grid, nb.r, nb.c, cand, hV, fV));
      } else {
        skippedWorse++;
      }
    }
    maxFrontier = Math.max(maxFrontier, openCount);
    yield {
      type: 'expand', algo, order: expanded, node: { r, c },
      g: gU, h: hU, f: useH ? gU + hU : null,
      added, updated, skippedVisited, skippedWorse, frontierSize: openCount,
    };
  }
  yield doneNotFound(algo, expanded, maxFrontier);
}

function* dijkstra(grid) {
  yield* costSearch(grid, 'dijkstra');
}

function* astar(grid) {
  yield* costSearch(grid, 'astar');
}

// Greedy best-first. Orders the frontier purely by the heuristic h; path cost
// so far is tracked only for reporting. Complete on a finite grid because
// cells are marked seen when pushed, but nothing about the path is optimal.
function* greedy(grid) {
  const n = grid.cells.length;
  const s = idx(grid, grid.start.r, grid.start.c);
  const t = idx(grid, grid.goal.r, grid.goal.c);
  const goal = rc(grid, t);
  const came = new Int32Array(n).fill(-1);
  const cost = new Float64Array(n).fill(Infinity);
  const seen = new Uint8Array(n);
  const heap = new MinHeap();
  let tie = 0;
  let expanded = 0;
  let open = 1;
  let maxFrontier = 1;

  const hOf = (i) => manhattan(rc(grid, i), goal);

  seen[s] = 1;
  cost[s] = 0;
  heap.push([hOf(s), tie++], s);

  yield { type: 'start', algo: 'greedy', node: rc(grid, s), goal, seed: { g: 0, h: hOf(s), f: null } };

  while (heap.size() > 0) {
    const { value: u } = heap.pop();
    open--;
    expanded++;
    const { r, c } = rc(grid, u);
    if (u === t) {
      yield { type: 'goal', algo: 'greedy', node: { r, c }, g: cost[u] };
      yield doneFound('greedy', grid, came, t, expanded, maxFrontier);
      return;
    }
    const added = [];
    let skippedVisited = 0;
    for (const nb of neighbors(grid, r, c)) {
      const v = idx(grid, nb.r, nb.c);
      if (seen[v]) {
        skippedVisited++;
        continue;
      }
      seen[v] = 1;
      came[v] = u;
      cost[v] = cost[u] + enterCost(grid, nb.r, nb.c);
      heap.push([hOf(v), tie++], v);
      open++;
      added.push(nodeInfo(grid, nb.r, nb.c, cost[v], hOf(v), null));
    }
    maxFrontier = Math.max(maxFrontier, open);
    yield {
      type: 'expand', algo: 'greedy', order: expanded, node: { r, c },
      g: cost[u], h: hOf(u), f: null,
      added, updated: [], skippedVisited, skippedWorse: 0, frontierSize: open,
    };
  }
  yield doneNotFound('greedy', expanded, maxFrontier);
}
