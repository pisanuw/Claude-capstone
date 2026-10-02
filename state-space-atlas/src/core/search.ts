import type { StateGraph } from './enumerate';

export type Algorithm = 'bfs' | 'dfs' | 'iddfs' | 'greedy' | 'astar';

export const ALGORITHMS: Array<{ id: Algorithm; name: string; usesHeuristic: boolean; blurb: string }> = [
  { id: 'bfs', name: 'Breadth-first search', usesHeuristic: false, blurb: 'FIFO queue. Optimal for unit costs, frontier grows with the layer width.' },
  { id: 'dfs', name: 'Depth-first search', usesHeuristic: false, blurb: 'LIFO stack with a visited set. Small frontier, path usually far from optimal.' },
  { id: 'iddfs', name: 'Iterative deepening DFS', usesHeuristic: false, blurb: 'Depth-limited DFS with the limit 0, 1, 2, ... Optimal, and re-expands shallow states every round.' },
  { id: 'greedy', name: 'Greedy best-first', usesHeuristic: true, blurb: 'Pops the smallest h. Fast when h is good, blind to path cost.' },
  { id: 'astar', name: 'A*', usesHeuristic: true, blurb: 'Pops the smallest g + h. Optimal with an admissible h; expands fewer nodes the tighter h is.' },
];

/** Per-node status for drawing: 0 unseen, 1 on the frontier, 2 expanded, 3 on the final path. */
export const UNSEEN = 0;
export const FRONTIER = 1;
export const EXPANDED = 2;
export const ON_PATH = 3;

export interface SearchStats {
  expanded: number;
  generated: number;
  frontier: number;
  /** Largest frontier + visited set seen so far (a proxy for memory). */
  peakMemory: number;
  /** Current IDDFS depth limit, if applicable. */
  depthLimit: number;
  /** Number of IDDFS rounds completed. */
  rounds: number;
  /** Nodes expanded more than once (IDDFS) or reopened (A* with an inconsistent h). */
  reexpanded: number;
}

export interface SearchResult {
  found: boolean;
  /** Node indices from start to goal when found. */
  path: number[];
  /** Why the search stopped: 'goal', 'exhausted' (no goal reachable) or 'budget'. */
  reason: 'goal' | 'exhausted' | 'budget';
}

export interface SearchOptions {
  /** Index to start from; defaults to the graph's start. */
  start?: number;
  /** Heuristic for greedy / A*; receives a node index. Defaults to 0. */
  heuristic?: (node: number) => number;
  /** Stop after this many expansions. */
  budget?: number;
}

export interface Search {
  readonly algorithm: Algorithm;
  readonly status: Uint8Array;
  readonly stats: SearchStats;
  /** The node expanded most recently (-1 before the first step). */
  readonly current: number;
  readonly result: SearchResult | null;
  /** Expand one node. Returns true when the search has finished. */
  step(): boolean;
  /** Expand up to `n` nodes. Returns true when finished. */
  run(n: number): boolean;
}

const DEFAULT_BUDGET = 5_000_000;

abstract class BaseSearch implements Search {
  readonly status: Uint8Array;
  readonly stats: SearchStats = { expanded: 0, generated: 0, frontier: 0, peakMemory: 0, depthLimit: 0, rounds: 0, reexpanded: 0 };
  current = -1;
  result: SearchResult | null = null;
  protected readonly parent: Int32Array;
  protected readonly startNode: number;
  protected readonly budget: number;
  protected readonly h: (node: number) => number;

  constructor(
    readonly algorithm: Algorithm,
    protected readonly g: StateGraph,
    opts: SearchOptions,
  ) {
    const n = g.keys.length;
    this.status = new Uint8Array(n);
    this.parent = new Int32Array(n).fill(-1);
    this.startNode = opts.start ?? g.start;
    this.budget = opts.budget ?? DEFAULT_BUDGET;
    this.h = opts.heuristic ?? (() => 0);
  }

  protected abstract stepImpl(): boolean;

  step(): boolean {
    if (this.result) return true;
    if (this.stats.expanded >= this.budget) {
      this.finish(false, 'budget');
      return true;
    }
    return this.stepImpl();
  }

  run(n: number): boolean {
    for (let i = 0; i < n; i++) if (this.step()) return true;
    return this.result !== null;
  }

  protected touchMemory(frontier: number, visited: number): void {
    this.stats.frontier = frontier;
    if (frontier + visited > this.stats.peakMemory) this.stats.peakMemory = frontier + visited;
  }

  protected finish(found: boolean, reason: SearchResult['reason'], goal = -1): void {
    const path: number[] = [];
    if (found) {
      for (let u = goal; u !== -1; u = this.parent[u]) path.push(u);
      path.reverse();
      for (const u of path) this.status[u] = ON_PATH;
    }
    this.result = { found, path, reason };
  }
}

/** FIFO or LIFO graph search; the goal test happens when a node is expanded. */
class QueueSearch extends BaseSearch {
  private queue: number[] = [];
  private head = 0;
  private visitedCount = 0;

  constructor(g: StateGraph, opts: SearchOptions, algorithm: 'bfs' | 'dfs') {
    super(algorithm, g, opts);
    this.queue.push(this.startNode);
    this.status[this.startNode] = FRONTIER;
    this.stats.generated = 1;
    this.touchMemory(1, 0);
  }

  protected stepImpl(): boolean {
    for (;;) {
      if (this.algorithm === 'bfs' ? this.head >= this.queue.length : this.queue.length === 0) {
        this.finish(false, 'exhausted');
        return true;
      }
      const u = this.algorithm === 'bfs' ? this.queue[this.head++] : this.queue.pop()!;
      if (this.status[u] === EXPANDED) continue; // DFS may hold duplicates on its stack.
      this.status[u] = EXPANDED;
      this.visitedCount++;
      this.current = u;
      this.stats.expanded++;
      if (this.g.distToGoal[u] === 0) {
        this.finish(true, 'goal', u);
        return true;
      }
      const g = this.g;
      const from = g.adjStart[u];
      const to = g.adjStart[u + 1];
      const bfs = this.algorithm === 'bfs';
      // DFS pushes in reverse so the first neighbour is explored first.
      for (let i = 0; i < to - from; i++) {
        const v = g.adj[bfs ? from + i : to - 1 - i];
        if (this.status[v] !== UNSEEN) continue;
        this.status[v] = FRONTIER;
        this.parent[v] = u;
        this.queue.push(v);
        this.stats.generated++;
      }
      this.touchMemory(this.algorithm === 'bfs' ? this.queue.length - this.head : this.queue.length, this.visitedCount);
      return false;
    }
  }
}

/**
 * Iterative deepening. Each round is a depth-limited DFS; a node is skipped
 * when the round already reached it at the same or a smaller depth (the usual
 * graph-search refinement, otherwise cycles make rounds exponential). Nodes
 * expanded in earlier rounds count again, which is the cost IDDFS pays.
 */
class IddfsSearch extends BaseSearch {
  private stack: Array<[number, number, number]> = [];
  private bestDepth: Int32Array;
  private roundVisited = 0;

  constructor(g: StateGraph, opts: SearchOptions) {
    super('iddfs', g, opts);
    this.bestDepth = new Int32Array(g.keys.length).fill(0x7fffffff);
    this.startRound(0);
  }

  private startRound(limit: number): void {
    this.stats.depthLimit = limit;
    this.bestDepth.fill(0x7fffffff);
    this.roundVisited = 0;
    this.stack = [[this.startNode, 0, -1]];
    this.parent.fill(-1);
    // Keep the drawing cumulative across rounds, but clear the frontier marks.
    for (let i = 0; i < this.status.length; i++) if (this.status[i] === FRONTIER) this.status[i] = UNSEEN;
    this.status[this.startNode] = FRONTIER;
    this.stats.generated++;
  }

  protected stepImpl(): boolean {
    for (;;) {
      if (this.stack.length === 0) {
        this.stats.rounds++;
        if (this.stats.depthLimit >= this.g.keys.length) {
          this.finish(false, 'exhausted');
          return true;
        }
        this.startRound(this.stats.depthLimit + 1);
        continue;
      }
      const [u, d, from] = this.stack.pop()!;
      if (this.bestDepth[u] <= d) continue;
      this.bestDepth[u] = d;
      this.parent[u] = from;
      if (this.status[u] === EXPANDED) this.stats.reexpanded++;
      this.status[u] = EXPANDED;
      this.roundVisited++;
      this.current = u;
      this.stats.expanded++;
      if (this.g.distToGoal[u] === 0) {
        this.finish(true, 'goal', u);
        return true;
      }
      if (d < this.stats.depthLimit) {
        const g = this.g;
        for (let k = g.adjStart[u + 1] - 1; k >= g.adjStart[u]; k--) {
          const v = g.adj[k];
          if (this.bestDepth[v] <= d + 1) continue;
          if (this.status[v] === UNSEEN) this.status[v] = FRONTIER;
          this.stack.push([v, d + 1, u]);
          this.stats.generated++;
        }
      }
      this.touchMemory(this.stack.length, this.roundVisited);
      return false;
    }
  }
}

/** Binary min-heap of (priority, tiebreak, node). */
class Heap {
  private keys: number[] = [];
  private ties: number[] = [];
  private nodes: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(key: number, tie: number, node: number): void {
    this.keys.push(key);
    this.ties.push(tie);
    this.nodes.push(node);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.keys.pop();
    this.ties.pop();
    this.nodes.pop();
    let i = 0;
    const n = this.nodes.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.ties[a] < this.ties[b]);
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.ties[a], this.ties[b]] = [this.ties[b], this.ties[a]];
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
  }
}

/**
 * Best-first search. Greedy orders by h alone and never reopens a node; A*
 * orders by g + h (ties broken towards smaller h) and reopens a closed node
 * when a shorter path to it appears, which only happens with an inconsistent
 * heuristic. Both test the goal at expansion time, as A* must.
 */
class BestFirstSearch extends BaseSearch {
  private heap = new Heap();
  private gScore: Float64Array;
  private hCache: Float64Array;
  private closedCount = 0;

  constructor(g: StateGraph, opts: SearchOptions, algorithm: 'greedy' | 'astar') {
    super(algorithm, g, opts);
    const n = g.keys.length;
    this.gScore = new Float64Array(n).fill(Infinity);
    this.hCache = new Float64Array(n).fill(NaN);
    this.gScore[this.startNode] = 0;
    this.heap.push(this.priority(this.startNode, 0), this.hOf(this.startNode), this.startNode);
    this.status[this.startNode] = FRONTIER;
    this.stats.generated = 1;
    this.touchMemory(1, 0);
  }

  private hOf(u: number): number {
    let v = this.hCache[u];
    if (Number.isNaN(v)) {
      v = this.h(u);
      if (!Number.isFinite(v)) v = 0;
      this.hCache[u] = v;
    }
    return v;
  }

  private priority(u: number, g: number): number {
    return this.algorithm === 'greedy' ? this.hOf(u) : g + this.hOf(u);
  }

  protected stepImpl(): boolean {
    for (;;) {
      if (this.heap.size === 0) {
        this.finish(false, 'exhausted');
        return true;
      }
      const u = this.heap.pop();
      if (this.status[u] === EXPANDED) continue; // stale heap entry
      this.status[u] = EXPANDED;
      this.closedCount++;
      this.current = u;
      this.stats.expanded++;
      if (this.g.distToGoal[u] === 0) {
        this.finish(true, 'goal', u);
        return true;
      }
      const g = this.g;
      const gu = this.gScore[u];
      for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
        const v = g.adj[k];
        const ng = gu + 1;
        if (this.algorithm === 'greedy') {
          if (this.status[v] !== UNSEEN) continue;
        } else if (ng >= this.gScore[v]) {
          continue;
        } else if (this.status[v] === EXPANDED) {
          // Shorter path to a closed node: reopen it.
          this.status[v] = FRONTIER;
          this.closedCount--;
          this.stats.reexpanded++;
        }
        this.gScore[v] = ng;
        this.parent[v] = u;
        this.status[v] = FRONTIER;
        this.heap.push(this.priority(v, ng), this.hOf(v), v);
        this.stats.generated++;
      }
      this.touchMemory(this.heap.size, this.closedCount);
      return false;
    }
  }
}

export function createSearch(g: StateGraph, algorithm: Algorithm, opts: SearchOptions = {}): Search {
  switch (algorithm) {
    case 'bfs':
    case 'dfs':
      return new QueueSearch(g, opts, algorithm);
    case 'iddfs':
      return new IddfsSearch(g, opts);
    case 'greedy':
    case 'astar':
      return new BestFirstSearch(g, opts, algorithm);
  }
}

/** Run a search to completion and return its result and stats. */
export function runSearch(g: StateGraph, algorithm: Algorithm, opts: SearchOptions = {}): { result: SearchResult; stats: SearchStats } {
  const s = createSearch(g, algorithm, opts);
  while (!s.step()) {
    /* keep stepping */
  }
  return { result: s.result!, stats: s.stats };
}
