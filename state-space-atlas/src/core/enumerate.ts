import type { Puzzle } from './puzzle';

/**
 * The whole reachable state space of a puzzle as a compact undirected graph.
 * Nodes are numbered in BFS order from the state the enumeration started at.
 */
export interface StateGraph {
  /** Canonical key of every node. */
  keys: string[];
  /** CSR adjacency: neighbours of i are adj[adjStart[i] .. adjStart[i+1]). */
  adjStart: Int32Array;
  adj: Int32Array;
  /** Index of the start node. */
  start: number;
  /** Indices of all goal nodes. */
  goals: Int32Array;
  /** Shortest-path distance from the start to each node. */
  distFromStart: Int32Array;
  /** Shortest-path distance from each node to the nearest goal, -1 if none is reachable. */
  distToGoal: Int32Array;
  edgeCount: number;
  /** Largest distFromStart. */
  depth: number;
  /** Largest finite distToGoal. */
  maxDistToGoal: number;
  /** Nodes from which no goal can be reached. */
  deadEnds: number;
  /** Longest shortest path between the start and any node that still reaches the goal. */
  optimalLength: number;
}

export interface EnumerateOptions {
  /** Abort when this many states have been discovered. */
  maxNodes?: number;
  /** Called every `progressEvery` discovered states. */
  onProgress?: (discovered: number, expanded: number) => void;
  progressEvery?: number;
}

export class TooManyStatesError extends Error {
  constructor(public readonly limit: number) {
    super(`More than ${limit.toLocaleString()} states; pick a smaller puzzle`);
    this.name = 'TooManyStatesError';
  }
}

export const DEFAULT_MAX_NODES = 400_000;

/**
 * Exhaustively enumerate every state reachable from the puzzle's start with a
 * breadth-first search, then compute true distances to the goal with a second
 * BFS from every goal state. Moves are reversible in all supported puzzles, so
 * the one adjacency structure serves both directions.
 *
 * When the puzzle asks for a `'farthest'` start, enumeration begins at the
 * goal (same connected component) and the start becomes the node farthest
 * from the goal.
 */
export function enumerateGraph(puzzle: Puzzle, opts: EnumerateOptions = {}): StateGraph {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const progressEvery = opts.progressEvery ?? 5000;
  const farthest = puzzle.start === 'farthest';
  const root = farthest ? puzzle.goalKey : puzzle.start;

  const keys: string[] = [root];
  const index = new Map<string, number>([[root, 0]]);
  const adjLists: number[][] = [];
  let edgeCount = 0;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const nbrs = puzzle.neighbors(key);
    const list: number[] = [];
    for (const nk of nbrs) {
      let j = index.get(nk);
      if (j === undefined) {
        j = keys.length;
        if (j >= maxNodes) throw new TooManyStatesError(maxNodes);
        index.set(nk, j);
        keys.push(nk);
        if (opts.onProgress && j % progressEvery === 0) opts.onProgress(j, i);
      }
      if (j !== i && !list.includes(j)) list.push(j);
    }
    adjLists.push(list);
    edgeCount += list.length;
  }

  const n = keys.length;
  const adjStart = new Int32Array(n + 1);
  const adj = new Int32Array(edgeCount);
  for (let i = 0, k = 0; i < n; i++) {
    adjStart[i] = k;
    for (const j of adjLists[i]) adj[k++] = j;
  }
  adjStart[n] = edgeCount;
  // Every edge was recorded from both ends, so this is the undirected count.
  edgeCount = edgeCount / 2;

  const goals: number[] = [];
  for (let i = 0; i < n; i++) if (puzzle.isGoal(keys[i])) goals.push(i);
  const distToGoal = multiSourceBfs(adjStart, adj, goals);

  let start = 0;
  if (farthest) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (distToGoal[i] > best) {
        best = distToGoal[i];
        start = i;
      }
    }
  }
  const distFromStart = multiSourceBfs(adjStart, adj, [start]);

  return finishGraph({
    keys,
    adjStart,
    adj,
    start,
    goals: Int32Array.from(goals),
    distFromStart,
    distToGoal,
    edgeCount,
  });
}

/** Recompute the start-dependent fields after moving the start to another node. */
export function restartGraph(g: StateGraph, start: number): StateGraph {
  return finishGraph({ ...g, start, distFromStart: multiSourceBfs(g.adjStart, g.adj, [start]) });
}

type Partial = Pick<StateGraph, 'keys' | 'adjStart' | 'adj' | 'start' | 'goals' | 'distFromStart' | 'distToGoal' | 'edgeCount'>;

function finishGraph(p: Partial): StateGraph {
  let depth = 0;
  let maxDistToGoal = 0;
  let deadEnds = 0;
  for (let i = 0; i < p.keys.length; i++) {
    if (p.distFromStart[i] > depth) depth = p.distFromStart[i];
    if (p.distToGoal[i] < 0) deadEnds++;
    else if (p.distToGoal[i] > maxDistToGoal) maxDistToGoal = p.distToGoal[i];
  }
  return { ...p, depth, maxDistToGoal, deadEnds, optimalLength: p.distToGoal[p.start] };
}

export function multiSourceBfs(adjStart: Int32Array, adj: Int32Array, sources: ArrayLike<number>): Int32Array {
  const n = adjStart.length - 1;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let s = 0; s < sources.length; s++) {
    const i = sources[s];
    if (dist[i] === -1) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const u = queue[head++];
    const d = dist[u] + 1;
    for (let k = adjStart[u]; k < adjStart[u + 1]; k++) {
      const v = adj[k];
      if (dist[v] === -1) {
        dist[v] = d;
        queue[tail++] = v;
      }
    }
  }
  return dist;
}

/** Shortest path (node indices) from `from` to the nearest goal, following distToGoal downhill. */
export function pathToGoal(g: StateGraph, from: number): number[] {
  if (g.distToGoal[from] < 0) return [];
  const path = [from];
  let u = from;
  while (g.distToGoal[u] > 0) {
    let next = -1;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
      const v = g.adj[k];
      if (g.distToGoal[v] === g.distToGoal[u] - 1) {
        next = v;
        break;
      }
    }
    /* istanbul ignore next -- a node with finite distance always has a downhill neighbour */
    if (next < 0) break;
    path.push(next);
    u = next;
  }
  return path;
}

/** Pack a graph for postMessage: typed arrays are transferable, keys travel as one string. */
export interface PackedGraph {
  keysJoined: string;
  keyLength: number;
  adjStart: Int32Array;
  adj: Int32Array;
  start: number;
  goals: Int32Array;
  distFromStart: Int32Array;
  distToGoal: Int32Array;
  edgeCount: number;
}

export function packGraph(g: StateGraph): PackedGraph {
  return {
    keysJoined: g.keys.join(''),
    keyLength: g.keys[0].length,
    adjStart: g.adjStart,
    adj: g.adj,
    start: g.start,
    goals: g.goals,
    distFromStart: g.distFromStart,
    distToGoal: g.distToGoal,
    edgeCount: g.edgeCount,
  };
}

export function unpackGraph(p: PackedGraph): StateGraph {
  const n = p.adjStart.length - 1;
  const keys: string[] = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = p.keysJoined.slice(i * p.keyLength, (i + 1) * p.keyLength);
  return finishGraph({
    keys,
    adjStart: p.adjStart,
    adj: p.adj,
    start: p.start,
    goals: p.goals,
    distFromStart: p.distFromStart,
    distToGoal: p.distToGoal,
    edgeCount: p.edgeCount,
  });
}
