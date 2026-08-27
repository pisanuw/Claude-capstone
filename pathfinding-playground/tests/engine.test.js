import { describe, it, expect } from 'vitest';
import {
  makeGrid, cloneGrid, idx, neighbors, enterCost, manhattan,
  EMPTY, WALL, MUD, MUD_COST,
} from '../src/engine/grid.js';
import { runAlgorithm, ALGORITHMS } from '../src/engine/algorithms.js';
import { narrate, compareVerdict } from '../src/engine/narrate.js';
import { encodeState, decodeState, rleEncode, rleDecode } from '../src/engine/share.js';
import { recursiveDivision, scatterMud, mulberry32 } from '../src/engine/maze.js';

const summary = (events) => events[events.length - 1];

function assertValidPath(grid, done) {
  expect(done.found).toBe(true);
  const p = done.path;
  expect(p[0]).toEqual(grid.start);
  expect(p[p.length - 1]).toEqual(grid.goal);
  let cost = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    expect(Math.abs(a.r - b.r) + Math.abs(a.c - b.c)).toBe(1);
    expect(grid.cells[idx(grid, b.r, b.c)]).not.toBe(WALL);
    cost += enterCost(grid, b.r, b.c);
  }
  expect(done.steps).toBe(p.length - 1);
  expect(done.cost).toBe(cost);
}

function randomGrid(rng, cols = 18, rows = 12, pWall = 0.25, pMud = 0.15) {
  const grid = makeGrid(cols, rows);
  for (let i = 0; i < grid.cells.length; i++) {
    const x = rng();
    grid.cells[i] = x < pWall ? WALL : x < pWall + pMud ? MUD : EMPTY;
  }
  grid.start = { r: Math.floor(rng() * rows), c: Math.floor(rng() * cols) };
  do {
    grid.goal = { r: Math.floor(rng() * rows), c: Math.floor(rng() * cols) };
  } while (grid.goal.r === grid.start.r && grid.goal.c === grid.start.c);
  grid.cells[idx(grid, grid.start.r, grid.start.c)] = EMPTY;
  grid.cells[idx(grid, grid.goal.r, grid.goal.c)] = EMPTY;
  return grid;
}

describe('grid', () => {
  it('lists neighbors in up, right, down, left order and respects walls', () => {
    const g = makeGrid(5, 5);
    g.cells[idx(g, 1, 2)] = WALL; // above (2,2)
    const ns = neighbors(g, 2, 2);
    expect(ns).toEqual([
      { r: 2, c: 3 },
      { r: 3, c: 2 },
      { r: 2, c: 1 },
    ]);
    expect(neighbors(g, 0, 0)).toEqual([
      { r: 0, c: 1 },
      { r: 1, c: 0 },
    ]);
  });

  it('charges mud on entry', () => {
    const g = makeGrid(4, 4);
    g.cells[idx(g, 1, 1)] = MUD;
    expect(enterCost(g, 1, 1)).toBe(MUD_COST);
    expect(enterCost(g, 0, 0)).toBe(1);
  });
});

describe('algorithms on an open grid', () => {
  const grid = makeGrid(16, 10);
  grid.start = { r: 2, c: 1 };
  grid.goal = { r: 8, c: 13 };
  const shortest = manhattan(grid.start, grid.goal);

  for (const key of Object.keys(ALGORITHMS)) {
    it(`${key} finds a valid path`, () => {
      const done = summary(runAlgorithm(key, grid));
      assertValidPath(grid, done);
    });
  }

  it('bfs, dijkstra, astar all find the shortest step count with no weights', () => {
    for (const key of ['bfs', 'dijkstra', 'astar']) {
      const done = summary(runAlgorithm(key, grid));
      expect(done.steps).toBe(shortest);
      expect(done.cost).toBe(shortest);
    }
  });
});

describe('algorithms on random weighted grids', () => {
  it('astar always matches dijkstra cost, and neither is beaten by the others', () => {
    const rng = mulberry32(42);
    let solvable = 0;
    for (let trial = 0; trial < 60; trial++) {
      const grid = randomGrid(rng);
      const results = {};
      for (const key of Object.keys(ALGORITHMS)) {
        results[key] = summary(runAlgorithm(key, grid));
      }
      const reachable = results.bfs.found;
      for (const key of Object.keys(ALGORITHMS)) {
        expect(results[key].found).toBe(reachable);
      }
      if (!reachable) continue;
      solvable++;
      for (const key of Object.keys(ALGORITHMS)) {
        assertValidPath(grid, results[key]);
      }
      expect(results.astar.cost).toBe(results.dijkstra.cost);
      expect(results.bfs.cost).toBeGreaterThanOrEqual(results.dijkstra.cost);
      expect(results.greedy.cost).toBeGreaterThanOrEqual(results.dijkstra.cost);
      expect(results.dfs.cost).toBeGreaterThanOrEqual(results.dijkstra.cost);
      expect(results.bfs.steps).toBeLessThanOrEqual(results.dfs.steps);
      expect(results.bfs.steps).toBeLessThanOrEqual(results.greedy.steps);
    }
    expect(solvable).toBeGreaterThan(20);
  });

  it('reports not found when the goal is sealed', () => {
    const grid = makeGrid(10, 8);
    grid.start = { r: 1, c: 1 };
    grid.goal = { r: 4, c: 7 };
    for (const [r, c] of [[3, 6], [3, 7], [3, 8], [3, 9], [4, 6], [5, 6], [5, 7], [5, 8], [5, 9]]) {
      grid.cells[idx(grid, r, c)] = WALL;
    }
    for (const key of Object.keys(ALGORITHMS)) {
      const done = summary(runAlgorithm(key, grid));
      expect(done.found).toBe(false);
      expect(done.expanded).toBeGreaterThan(0);
    }
  });

  it('dijkstra pays for a detour around mud when the detour is cheaper', () => {
    // A 1-wide corridor of mud straight ahead versus a clear detour.
    const grid = makeGrid(7, 3);
    grid.start = { r: 1, c: 0 };
    grid.goal = { r: 1, c: 6 };
    for (let c = 1; c <= 5; c++) grid.cells[idx(grid, 1, c)] = MUD;
    const bfsDone = summary(runAlgorithm('bfs', grid));
    const dijDone = summary(runAlgorithm('dijkstra', grid));
    expect(bfsDone.steps).toBe(6); // straight through the mud
    expect(bfsDone.cost).toBe(5 * MUD_COST + 1);
    expect(dijDone.cost).toBe(8); // around it
    expect(dijDone.steps).toBe(8);
  });
});

describe('trace shape', () => {
  it('emits start, expansions with consistent order, then done', () => {
    const grid = makeGrid(9, 7);
    const events = runAlgorithm('astar', grid);
    expect(events[0].type).toBe('start');
    expect(events[events.length - 1].type).toBe('done');
    const expands = events.filter((e) => e.type === 'expand');
    expands.forEach((e, i) => {
      expect(e.order).toBe(i + 1);
      expect(e.f).toBe(e.g + e.h);
    });
    const goalEvents = events.filter((e) => e.type === 'goal');
    expect(goalEvents.length).toBe(1);
  });
});

describe('share links', () => {
  it('round trips a grid with walls, mud, and settings', () => {
    const rng = mulberry32(7);
    const grid = randomGrid(rng, 24, 15);
    const encoded = encodeState({ grid, algoA: 'astar', algoB: 'bfs', compare: true });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeState(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded.grid.cols).toBe(24);
    expect(decoded.grid.rows).toBe(15);
    expect([...decoded.grid.cells]).toEqual([...grid.cells]);
    expect(decoded.grid.start).toEqual(grid.start);
    expect(decoded.grid.goal).toEqual(grid.goal);
    expect(decoded.algoA).toBe('astar');
    expect(decoded.algoB).toBe('bfs');
    expect(decoded.compare).toBe(true);
  });

  it('rejects garbage, wrong lengths, and bad algorithms', () => {
    expect(decodeState('not base64!!!')).toBeNull();
    expect(decodeState('')).toBeNull();
    const grid = makeGrid(8, 8);
    const good = encodeState({ grid, algoA: 'astar', algoB: 'bfs', compare: false });
    const tampered = JSON.parse(Buffer.from(good.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    tampered.m = '3.'; // too short
    const bad1 = Buffer.from(JSON.stringify(tampered)).toString('base64url');
    expect(decodeState(bad1)).toBeNull();
    tampered.m = rleEncode(grid.cells);
    tampered.a = 'teleport';
    const bad2 = Buffer.from(JSON.stringify(tampered)).toString('base64url');
    expect(decodeState(bad2)).toBeNull();
  });

  it('rle round trips exactly', () => {
    const rng = mulberry32(99);
    const cells = new Uint8Array(500);
    for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(rng() * 3);
    expect([...rleDecode(rleEncode(cells), cells.length)]).toEqual([...cells]);
  });
});

describe('maze generation', () => {
  it('recursive division stays solvable across seeds and sizes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      const grid = makeGrid(10 + (seed % 3) * 11, 8 + (seed % 4) * 7);
      recursiveDivision(grid, rng);
      scatterMud(grid, 0.08, rng);
      expect(grid.cells[idx(grid, grid.start.r, grid.start.c)]).not.toBe(WALL);
      expect(grid.cells[idx(grid, grid.goal.r, grid.goal.c)]).not.toBe(WALL);
      const done = summary(runAlgorithm('bfs', grid));
      expect(done.found).toBe(true);
      const walls = [...grid.cells].filter((v) => v === WALL).length;
      expect(walls).toBeGreaterThan(0);
    }
  });
});

describe('narration', () => {
  it('produces a non-empty line for every event of every algorithm', () => {
    const rng = mulberry32(5);
    const grid = randomGrid(rng, 14, 10);
    for (const key of Object.keys(ALGORITHMS)) {
      const events = runAlgorithm(key, grid);
      for (const e of events) {
        const line = narrate(e);
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(10);
      }
    }
  });

  it('explains the pick with the numbers the algorithm used', () => {
    const grid = makeGrid(12, 8);
    const events = runAlgorithm('astar', grid);
    const firstExpand = events.find((e) => e.type === 'expand');
    const line = narrate(firstExpand);
    expect(line).toContain(`g ${firstExpand.g}`);
    expect(line).toContain(`h ${firstExpand.h}`);
    expect(line).toContain(`= ${firstExpand.f}`);
  });

  it('summarizes a comparison', () => {
    const grid = makeGrid(7, 3);
    grid.start = { r: 1, c: 0 };
    grid.goal = { r: 1, c: 6 };
    for (let c = 1; c <= 5; c++) grid.cells[idx(grid, 1, c)] = MUD;
    const a = summary(runAlgorithm('dijkstra', grid));
    const b = summary(runAlgorithm('bfs', grid));
    const v = compareVerdict(a, b);
    expect(v).toContain('Dijkstra');
    expect(v).toContain('cheaper');
  });
});

describe('determinism', () => {
  it('same grid always yields the identical trace', () => {
    const rng = mulberry32(1234);
    const grid = randomGrid(rng, 20, 14);
    for (const key of Object.keys(ALGORITHMS)) {
      const a = runAlgorithm(key, cloneGrid(grid));
      const b = runAlgorithm(key, cloneGrid(grid));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
