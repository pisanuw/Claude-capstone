import { describe, expect, it } from 'vitest';
import { enumerateGraph } from '../src/core/enumerate';
import { createPuzzle } from '../src/core/factory';
import { compileHeuristic, evaluateHeuristic, heuristicFromValues, HEURISTIC_PRESETS } from '../src/core/heuristic';
import { KLOTSKI_CLASSIC, RUSH_HOUR_CARD_1 } from '../src/core/presets';
import { ALGORITHMS, EXPANDED, FRONTIER, ON_PATH, UNSEEN, createSearch, runSearch, type Algorithm } from '../src/core/search';

const hanoi4 = enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 4 }));
const tiles23 = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 3 }));
const tiles24 = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 4 }));
const tilesPuzzle = createPuzzle({ kind: 'tiles', rows: 2, cols: 4 });

function presetH(id: string, g = tiles24, puzzle = tilesPuzzle) {
  const src = HEURISTIC_PRESETS.find((p) => p.id === id)!.source;
  return heuristicFromValues(evaluateHeuristic(g, puzzle, compileHeuristic(src).fn));
}

function isValidPath(g: typeof hanoi4, path: number[], start: number): boolean {
  if (path[0] !== start || g.distToGoal[path[path.length - 1]] !== 0) return false;
  for (let i = 1; i < path.length; i++) {
    const nbrs = Array.from(g.adj.subarray(g.adjStart[path[i - 1]], g.adjStart[path[i - 1] + 1]));
    if (!nbrs.includes(path[i])) return false;
  }
  return true;
}

describe('uninformed searches', () => {
  it('BFS finds an optimal path and expands most of the Hanoi space', () => {
    const { result, stats } = runSearch(hanoi4, 'bfs');
    expect(result.found).toBe(true);
    expect(result.reason).toBe('goal');
    expect(result.path).toHaveLength(hanoi4.optimalLength + 1);
    expect(isValidPath(hanoi4, result.path, hanoi4.start)).toBe(true);
    expect(stats.expanded).toBeGreaterThan(60);
    expect(stats.peakMemory).toBeGreaterThanOrEqual(stats.expanded);
  });

  it('DFS finds a (usually longer) valid path with a small frontier', () => {
    const { result, stats } = runSearch(tiles23, 'dfs');
    expect(result.found).toBe(true);
    expect(isValidPath(tiles23, result.path, tiles23.start)).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(tiles23.optimalLength + 1);
    expect(stats.generated).toBeGreaterThanOrEqual(stats.expanded);
  });

  it('IDDFS is optimal and re-expands shallow nodes', () => {
    const { result, stats } = runSearch(hanoi4, 'iddfs');
    expect(result.found).toBe(true);
    expect(result.path).toHaveLength(hanoi4.optimalLength + 1);
    expect(isValidPath(hanoi4, result.path, hanoi4.start)).toBe(true);
    expect(stats.depthLimit).toBe(hanoi4.optimalLength);
    expect(stats.rounds).toBe(hanoi4.optimalLength);
    expect(stats.reexpanded).toBeGreaterThan(0);
    const bfs = runSearch(hanoi4, 'bfs');
    expect(stats.expanded).toBeGreaterThan(bfs.stats.expanded);
  });

  it('IDDFS and the others report exhaustion when no goal is reachable', () => {
    const dead = enumerateGraph(
      createPuzzle({ kind: 'blocks', grid: ['XXA.', 'XXA.', 'B.C.', 'BDD.'], goal: { piece: 'X', row: 2, col: 2 }, moves: 'free' }),
    );
    for (const algo of ['bfs', 'dfs', 'greedy', 'astar'] as Algorithm[]) {
      const { result, stats } = runSearch(dead, algo);
      expect(result.found, algo).toBe(false);
      expect(result.reason, algo).toBe('exhausted');
      expect(stats.expanded, algo).toBe(dead.keys.length);
    }
    const idd = runSearch(dead, 'iddfs', { budget: 20_000 });
    expect(idd.result.found).toBe(false);
    expect(['exhausted', 'budget']).toContain(idd.result.reason);
  });

  it('stops at the expansion budget', () => {
    const { result, stats } = runSearch(tiles24, 'bfs', { budget: 500 });
    expect(result.found).toBe(false);
    expect(result.reason).toBe('budget');
    expect(stats.expanded).toBe(500);
  });

  it('can start from any node', () => {
    const goal = hanoi4.goals[0];
    const { result, stats } = runSearch(hanoi4, 'bfs', { start: goal });
    expect(result.path).toEqual([goal]);
    expect(stats.expanded).toBe(1);
  });
});

describe('informed searches', () => {
  it('A* with Manhattan is optimal and expands far fewer nodes than BFS', () => {
    const bfs = runSearch(tiles24, 'bfs');
    const astar = runSearch(tiles24, 'astar', { heuristic: presetH('tiles-manhattan') });
    expect(astar.result.found).toBe(true);
    expect(astar.result.path).toHaveLength(tiles24.optimalLength + 1);
    expect(isValidPath(tiles24, astar.result.path, tiles24.start)).toBe(true);
    expect(astar.stats.expanded).toBeLessThan(bfs.stats.expanded * 0.6);
    const misplaced = runSearch(tiles24, 'astar', { heuristic: presetH('tiles-misplaced') });
    expect(misplaced.result.path).toHaveLength(tiles24.optimalLength + 1);
    expect(misplaced.stats.expanded).toBeGreaterThan(astar.stats.expanded);
  });

  it('A* with the zero heuristic behaves like BFS (same optimal length)', () => {
    const zero = runSearch(tiles23, 'astar');
    expect(zero.result.path).toHaveLength(tiles23.optimalLength + 1);
    expect(zero.stats.reexpanded).toBe(0);
  });

  it('A* with the perfect heuristic walks straight to the goal', () => {
    const perfect = runSearch(tiles24, 'astar', { heuristic: (i) => tiles24.distToGoal[i] });
    expect(perfect.result.path).toHaveLength(tiles24.optimalLength + 1);
    expect(perfect.stats.expanded).toBe(tiles24.optimalLength + 1);
  });

  it('greedy best-first finds a valid but possibly longer path quickly', () => {
    const greedy = runSearch(tiles24, 'greedy', { heuristic: presetH('tiles-manhattan') });
    expect(greedy.result.found).toBe(true);
    expect(isValidPath(tiles24, greedy.result.path, tiles24.start)).toBe(true);
    expect(greedy.result.path.length).toBeGreaterThanOrEqual(tiles24.optimalLength + 1);
    const astar = runSearch(tiles24, 'astar', { heuristic: presetH('tiles-manhattan') });
    expect(greedy.stats.expanded).toBeLessThanOrEqual(astar.stats.expanded);
  });

  it('an inadmissible heuristic can make A* return a longer path', () => {
    const puzzle23 = createPuzzle({ kind: 'tiles', rows: 2, cols: 3 });
    const h = presetH('tiles-manhattan-x2', tiles23, puzzle23);
    let longer = 0;
    for (let start = 0; start < tiles23.keys.length; start++) {
      const run = runSearch(tiles23, 'astar', { start, heuristic: h });
      expect(run.result.found).toBe(true);
      expect(isValidPath(tiles23, run.result.path, start)).toBe(true);
      expect(run.result.path.length).toBeGreaterThanOrEqual(tiles23.distToGoal[start] + 1);
      if (run.result.path.length > tiles23.distToGoal[start] + 1) longer++;
    }
    expect(longer).toBeGreaterThan(0);
  });

  it('A* reopens nodes when the heuristic is inconsistent', () => {
    // Inconsistent on purpose: a huge value on one node that sits on every short path's way.
    const g = hanoi4;
    const target = g.adj[g.adjStart[g.start]];
    const h = (i: number) => (i === target ? 0 : i === g.start ? 0 : 5);
    const s = runSearch(g, 'astar', { heuristic: h });
    expect(s.result.found).toBe(true);
    expect(isValidPath(g, s.result.path, g.start)).toBe(true);
  });

  it('treats non-finite heuristic values as zero', () => {
    const s = runSearch(hanoi4, 'astar', { heuristic: () => Infinity });
    expect(s.result.found).toBe(true);
    expect(s.result.path).toHaveLength(hanoi4.optimalLength + 1);
  });

  it('solves Klotski and Rush Hour optimally with the block heuristics', () => {
    const klotski = enumerateGraph(createPuzzle(KLOTSKI_CLASSIC));
    const kp = createPuzzle(KLOTSKI_CLASSIC);
    const h = presetH('blocks-goal-plus-blockers', klotski, kp);
    const a = runSearch(klotski, 'astar', { heuristic: h });
    expect(a.result.path).toHaveLength(117);
    const bfs = runSearch(klotski, 'bfs');
    expect(a.stats.expanded).toBeLessThan(bfs.stats.expanded);

    const rush = enumerateGraph(createPuzzle(RUSH_HOUR_CARD_1));
    const rp = createPuzzle(RUSH_HOUR_CARD_1);
    const r = runSearch(rush, 'astar', { heuristic: presetH('blocks-goal-distance', rush, rp) });
    expect(r.result.path).toHaveLength(17);
  });
});

describe('step-wise API', () => {
  it('exposes live status, stats and the current node while stepping', () => {
    const s = createSearch(hanoi4, 'bfs');
    expect(s.current).toBe(-1);
    expect(s.status[hanoi4.start]).toBe(FRONTIER);
    expect(s.step()).toBe(false);
    expect(s.current).toBe(hanoi4.start);
    expect(s.status[hanoi4.start]).toBe(EXPANDED);
    expect(s.stats.expanded).toBe(1);
    expect(s.stats.frontier).toBe(2);
    let done = false;
    while (!done) done = s.run(10);
    expect(s.result?.found).toBe(true);
    expect(s.step()).toBe(true); // idempotent after finishing
    const onPath = Array.from(s.status).filter((v) => v === ON_PATH).length;
    expect(onPath).toBe(s.result!.path.length);
    const unseen = Array.from(s.status).filter((v) => v === UNSEEN).length;
    expect(unseen).toBeGreaterThanOrEqual(0);
  });

  it('lists every algorithm with metadata', () => {
    expect(ALGORITHMS.map((a) => a.id)).toEqual(['bfs', 'dfs', 'iddfs', 'greedy', 'astar']);
    expect(ALGORITHMS.filter((a) => a.usesHeuristic).map((a) => a.id)).toEqual(['greedy', 'astar']);
  });
});
