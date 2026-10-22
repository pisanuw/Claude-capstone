import { describe, expect, it } from 'vitest';
import { feedbackEdges } from '../src/core/acyclic';
import { mulberry32 } from '../src/core/bench';
import { LayerAdjacency, bilayerCrossings, minimizeCrossings, transpose } from '../src/core/order';
import { brandesKopf, priorityLayout, separation, type PNode } from '../src/core/position';
import { longestPath, networkSimplex, slack, totalLength } from '../src/core/rank';
import { hasCycle, nodesOf, randomDag, wedges } from './helpers';

describe('cycle removal', () => {
  const cyclic: [string, string][] = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'c'],
    ['e', 'f'],
  ];

  for (const method of ['greedy', 'dfs'] as const) {
    it(`${method} leaves an acyclic graph`, () => {
      const nodes = nodesOf(cyclic);
      const es = wedges(cyclic);
      const flip = feedbackEdges(nodes, es, method);
      const fixed = es.map((e) => (flip.has(e.id) ? { ...e, v: e.w, w: e.v } : e));
      expect(hasCycle(nodes, es)).toBe(true);
      expect(hasCycle(nodes, fixed)).toBe(false);
      expect(flip.size).toBeGreaterThan(0);
    });

    it(`${method} reverses nothing on a DAG`, () => {
      const g = randomDag(7, 15, 0.3);
      expect(feedbackEdges(g.nodes, g.edges, method).size).toBe(0);
    });
  }

  it('greedy stays within the Eades-Lin-Smyth bound on random graphs', () => {
    const rng = mulberry32(11);
    for (let t = 0; t < 30; t++) {
      const n = 6 + Math.floor(rng() * 14);
      const nodes = Array.from({ length: n }, (_, k) => `v${k}`);
      const pairs: [string, string][] = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.2) pairs.push([nodes[i], nodes[j]]);
      const es = wedges(pairs);
      const flip = feedbackEdges(nodes, es, 'greedy');
      const fixed = es.map((e) => (flip.has(e.id) ? { ...e, v: e.w, w: e.v } : e));
      expect(hasCycle(nodes, fixed)).toBe(false);
      expect(flip.size).toBeLessThanOrEqual(Math.max(0, es.length / 2 - n / 6) + 1e-9);
    }
  });
});

describe('layering', () => {
  it('longest path puts sources on rank 0 and respects minlen', () => {
    const es = wedges([
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ]);
    es[0].minlen = 2;
    const r = longestPath(['a', 'b', 'c'], es);
    expect([r.get('a'), r.get('b'), r.get('c')]).toEqual([0, 2, 3]);
    expect(() => longestPath(['a', 'b'], wedges([['a', 'b'], ['b', 'a']]))).toThrow(/cycle/);
  });

  it('network simplex is feasible and never longer than longest path', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = randomDag(seed, 14, 0.18);
      const lp = longestPath(g.nodes, g.edges);
      const ns = networkSimplex(g.nodes, g.edges);
      for (const e of g.edges) expect(slack(ns, e)).toBeGreaterThanOrEqual(0);
      expect(totalLength(ns, g.edges)).toBeLessThanOrEqual(totalLength(lp, g.edges));
      expect(Math.min(...g.nodes.map((n) => ns.get(n)!))).toBe(0);
    }
  });

  it('network simplex finds the optimum on small graphs (brute force check)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = randomDag(seed * 31, 6, 0.35);
      const ns = networkSimplex(g.nodes, g.edges);
      // Enumerate all rank assignments 0..5 and keep the best feasible one.
      let best = Infinity;
      const ranks = new Map<string, number>();
      const rec = (k: number): void => {
        if (k === g.nodes.length) {
          if (g.edges.every((e) => slack(ranks, e) >= 0)) best = Math.min(best, totalLength(ranks, g.edges));
          return;
        }
        for (let v = 0; v < 6; v++) {
          ranks.set(g.nodes[k], v);
          rec(k + 1);
        }
      };
      rec(0);
      expect(totalLength(ns, g.edges)).toBe(best);
    }
  });

  it('pulls a lone source down next to its child', () => {
    // a -> b -> c -> d and x -> d: longest path puts x on rank 0.
    const es = wedges([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['x', 'd'],
    ]);
    const nodes = ['a', 'b', 'c', 'd', 'x'];
    expect(longestPath(nodes, es).get('x')).toBe(0);
    expect(networkSimplex(nodes, es).get('x')).toBe(2);
  });

  it('ranks disconnected components independently', () => {
    const r = networkSimplex(['a', 'b', 'c', 'd', 'e'], wedges([['a', 'b'], ['c', 'd']]));
    expect([r.get('a'), r.get('b'), r.get('c'), r.get('d'), r.get('e')]).toEqual([0, 1, 0, 1, 0]);
  });
});

function bruteCrossings(north: string[], south: string[], edges: { v: string; w: string; weight: number }[]): number {
  let c = 0;
  const a = (n: string) => north.indexOf(n);
  const b = (n: string) => south.indexOf(n);
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const p = edges[i];
      const q = edges[j];
      if ((a(p.v) - a(q.v)) * (b(p.w) - b(q.w)) < 0) c += p.weight * q.weight;
    }
  return c;
}

describe('crossing minimisation', () => {
  it('accumulator-tree count matches brute force', () => {
    const rng = mulberry32(5);
    for (let t = 0; t < 40; t++) {
      const north = Array.from({ length: 2 + Math.floor(rng() * 6) }, (_, k) => `a${k}`);
      const south = Array.from({ length: 1 + Math.floor(rng() * 7) }, (_, k) => `b${k}`);
      const edges = [];
      for (const v of north) for (const w of south) if (rng() < 0.4) edges.push({ v, w, weight: 1 + Math.floor(rng() * 2) });
      expect(bilayerCrossings(north, south, edges)).toBe(bruteCrossings(north, south, edges));
    }
    expect(bilayerCrossings([], ['x'], [])).toBe(0);
  });

  it('untangles a crossed bipartite graph completely', () => {
    const layers = [
      ['a', 'b', 'c'],
      ['z', 'y', 'x'],
    ];
    const edges = [
      { v: 'a', w: 'x', weight: 1 },
      { v: 'b', w: 'y', weight: 1 },
      { v: 'c', w: 'z', weight: 1 },
    ];
    for (const method of ['barycenter', 'median'] as const) {
      const r = minimizeCrossings(layers, edges, { method, transpose: false, sweeps: 4 }, true);
      expect(r.crossings).toBe(0);
      expect(r.snapshots[0].label).toMatch(/initial/);
    }
  });

  it('transpose removes a crossing the sweep cannot see', () => {
    const layers = [['a', 'b'], ['c', 'd']];
    const edges = [
      { v: 'a', w: 'd', weight: 1 },
      { v: 'b', w: 'c', weight: 1 },
    ];
    const adj = new LayerAdjacency(layers, edges);
    expect(adj.crossings(layers)).toBe(1);
    transpose(layers, adj);
    expect(adj.crossings(layers)).toBe(0);
  });

  it('never returns more crossings than the initial order', () => {
    const rng = mulberry32(9);
    for (let t = 0; t < 15; t++) {
      const layers = Array.from({ length: 4 }, (_, r) => Array.from({ length: 2 + Math.floor(rng() * 4) }, (_, k) => `L${r}n${k}`));
      const edges = [];
      for (let r = 0; r < 3; r++) for (const v of layers[r]) for (const w of layers[r + 1]) if (rng() < 0.35) edges.push({ v, w, weight: 1 });
      const r = minimizeCrossings(layers, edges, { method: 'median', transpose: true, sweeps: 8 }, true);
      expect(r.crossings).toBeLessThanOrEqual(r.snapshots[0].crossings);
      expect(r.layers.map((l) => l.length)).toEqual(layers.map((l) => l.length));
      expect(r.snapshots[r.best].crossings).toBe(r.crossings);
    }
  });
});

describe('coordinate assignment', () => {
  const build = () => {
    const layers = [['a', 'b'], ['d1', 'c', 'e'], ['d2', 'f'], ['g']];
    const nodes = new Map<string, PNode>();
    for (const n of layers.flat()) nodes.set(n, { width: n.startsWith('d') ? 0 : 60, dummy: n.startsWith('d'), padRight: n === 'c' ? 20 : 0 });
    const edges = [
      { v: 'a', w: 'd1', weight: 1 },
      { v: 'd1', w: 'd2', weight: 1 },
      { v: 'd2', w: 'g', weight: 1 },
      { v: 'a', w: 'c', weight: 1 },
      { v: 'b', w: 'e', weight: 1 },
      { v: 'c', w: 'f', weight: 1 },
      { v: 'e', w: 'f', weight: 1 },
      { v: 'f', w: 'g', weight: 1 },
    ];
    return { layers, nodes, edges, nodeSep: 30, edgeSep: 10 };
  };

  for (const [name, fn] of [
    ['Brandes-Koepf', brandesKopf],
    ['priority', priorityLayout],
  ] as const) {
    it(`${name} keeps the order and the minimum separation`, () => {
      const input = build();
      const xs = fn(input);
      for (const layer of input.layers) {
        for (let k = 1; k < layer.length; k++) {
          expect(xs.get(layer[k])! - xs.get(layer[k - 1])!).toBeGreaterThanOrEqual(separation(input, layer[k - 1], layer[k]) - 1e-6);
        }
      }
    });
  }

  it('Brandes-Koepf keeps a long edge straight', () => {
    const input = build();
    const xs = brandesKopf(input);
    expect(xs.get('d1')).toBeCloseTo(xs.get('d2')!, 6);
  });

  it('separation mixes node and edge gaps', () => {
    const input = build();
    expect(separation(input, 'a', 'b')).toBe(60 + 30);
    expect(separation(input, 'd1', 'c')).toBe(30 + 20);
    expect(separation(input, 'c', 'e')).toBe(60 + 20 + 30);
  });
});
