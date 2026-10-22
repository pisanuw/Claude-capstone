// A fixed, seeded benchmark of 50 graphs and a handful of pipeline
// configurations, scored on crossings, drawing area, total edge length and
// bends. The graphs are emitted as Mermaid source so any of them can be opened
// in the editor.

import { layoutChart } from './layout';
import { parse } from './parser';
import type { LayoutOptions, LayoutStats } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchGraph {
  id: string;
  family: string;
  source: string;
}

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

function emit(dir: string, n: number, edges: [number, number][], extra = ''): string {
  const lines = [`flowchart ${dir}`];
  for (let k = 0; k < n; k++) lines.push(`  n${k}[N${k}]`);
  for (const [a, b] of edges) lines.push(`  n${a} --> n${b}`);
  return lines.join('\n') + (extra ? `\n${extra}` : '') + '\n';
}

function randomDag(rng: Rng, n: number, density: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let j = 1; j < n; j++) edges.push([int(rng, Math.max(0, j - 4), j - 1), j]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < Math.min(n, i + 7); j++) if (rng() < density) edges.push([i, j]);
  return edges;
}

function tree(rng: Rng, n: number, maxKids: number): [number, number][] {
  const edges: [number, number][] = [];
  const open = [0];
  let next = 1;
  while (next < n && open.length) {
    const p = open.shift()!;
    const kids = int(rng, 1, maxKids);
    for (let k = 0; k < kids && next < n; k++) {
      edges.push([p, next]);
      open.push(next++);
    }
  }
  return edges;
}

function layeredRandom(rng: Rng, layers: number, width: number, p: number): { n: number; edges: [number, number][] } {
  const ids: number[][] = [];
  let n = 0;
  for (let l = 0; l < layers; l++) ids.push(Array.from({ length: int(rng, 2, width) }, () => n++));
  const edges: [number, number][] = [];
  for (let l = 0; l + 1 < layers; l++) {
    for (const b of ids[l + 1]) edges.push([ids[l][int(rng, 0, ids[l].length - 1)], b]);
    for (const a of ids[l]) for (const b of ids[l + 1]) if (rng() < p) edges.push([a, b]);
    if (l + 2 < layers && rng() < 0.6) edges.push([ids[l][0], ids[l + 2][ids[l + 2].length - 1]]);
  }
  return { n, edges: dedupe(edges) };
}

function cyclic(rng: Rng, n: number, back: number): [number, number][] {
  const edges = randomDag(rng, n, 0.15);
  for (let k = 0; k < back; k++) {
    const a = int(rng, 2, n - 1);
    edges.push([a, int(rng, 0, a - 1)]);
  }
  return dedupe(edges);
}

function dedupe(edges: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  return edges.filter(([a, b]) => {
    const k = `${a},${b}`;
    if (seen.has(k) || a === b) return false;
    seen.add(k);
    return true;
  });
}

function clustered(rng: Rng, groups: number, size: number): string {
  const lines = ['flowchart TD'];
  const all: string[] = [];
  for (let g = 0; g < groups; g++) {
    lines.push(`  subgraph g${g} [Group ${g}]`);
    if (rng() < 0.4) lines.push('    direction LR');
    const ids = Array.from({ length: size }, (_, k) => `g${g}n${k}`);
    for (let k = 1; k < size; k++) lines.push(`    ${ids[int(rng, 0, k - 1)]} --> ${ids[k]}`);
    lines.push('  end');
    all.push(...ids);
  }
  for (let k = 0; k < groups + 2; k++) {
    const a = int(rng, 0, groups - 2);
    const b = int(rng, a + 1, groups - 1);
    lines.push(`  g${a}n${int(rng, 0, size - 1)} --> g${b}n${int(rng, 0, size - 1)}`);
  }
  lines.push(`  start((Start)) --> ${all[0]}`);
  return lines.join('\n') + '\n';
}

/** The 50-graph benchmark. Same seed, same graphs, every time. */
export function benchmarkGraphs(seed = 2026): BenchGraph[] {
  const rng = mulberry32(seed);
  const out: BenchGraph[] = [];
  const add = (family: string, source: string): void => {
    out.push({ id: `G${String(out.length + 1).padStart(2, '0')}`, family, source });
  };
  for (let k = 0; k < 12; k++) {
    const n = int(rng, 8, 26);
    add('sparse DAG', emit('TD', n, randomDag(rng, n, 0.12)));
  }
  for (let k = 0; k < 8; k++) {
    const n = int(rng, 10, 30);
    add('dense DAG', emit('TD', n, randomDag(rng, n, 0.32)));
  }
  for (let k = 0; k < 6; k++) {
    const n = int(rng, 10, 32);
    add('tree', emit('TD', n, tree(rng, n, 3)));
  }
  for (let k = 0; k < 10; k++) {
    const g = layeredRandom(rng, int(rng, 4, 7), int(rng, 3, 5), 0.2);
    add('layered', emit(k % 3 === 0 ? 'LR' : 'TD', g.n, g.edges));
  }
  for (let k = 0; k < 9; k++) {
    const n = int(rng, 8, 22);
    add('cyclic', emit('TD', n, cyclic(rng, n, int(rng, 2, 5))));
  }
  for (let k = 0; k < 5; k++) add('clustered', clustered(rng, int(rng, 2, 4), int(rng, 3, 5)));
  return out;
}

export interface BenchConfig {
  id: string;
  label: string;
  options: Partial<LayoutOptions>;
}

export const BENCH_CONFIGS: BenchConfig[] = [
  {
    id: 'baseline',
    label: 'Longest path + barycenter, priority coords',
    options: { cycle: 'dfs', rank: 'longest-path', order: 'barycenter', transpose: false, position: 'priority' },
  },
  {
    id: 'transpose',
    label: 'Longest path + barycenter + transpose',
    options: { cycle: 'greedy', rank: 'longest-path', order: 'barycenter', transpose: true, position: 'priority' },
  },
  {
    id: 'simplex',
    label: 'Network simplex + median + transpose, priority coords',
    options: { cycle: 'greedy', rank: 'network-simplex', order: 'median', transpose: true, position: 'priority' },
  },
  {
    id: 'median-bk',
    label: 'Network simplex + median + transpose, Brandes-Koepf',
    options: { cycle: 'greedy', rank: 'network-simplex', order: 'median', transpose: true, position: 'brandes-kopf' },
  },
  {
    id: 'full',
    label: 'Network simplex + barycenter + transpose, Brandes-Koepf (default)',
    options: { cycle: 'greedy', rank: 'network-simplex', order: 'barycenter', transpose: true, position: 'brandes-kopf' },
  },
];

export const METRICS = ['crossings', 'area', 'edgeLength', 'bends'] as const;
export type Metric = (typeof METRICS)[number];

export interface BenchRow {
  graph: string;
  config: string;
  stats: LayoutStats;
}

export function runOne(graph: BenchGraph, config: BenchConfig, extra: Partial<LayoutOptions> = {}): BenchRow {
  const chart = parse(graph.source);
  const layout = layoutChart(chart, { ...config.options, ...extra });
  return { graph: graph.id, config: config.id, stats: layout.stats };
}

export interface BenchSummary {
  config: string;
  totals: Record<Metric, number>;
  /** Mean per-graph rank (1 = best) over all four metrics. */
  meanRank: number;
  wins: number;
  ms: number;
}

/** Rank configurations per graph and metric (ties share the better rank), then average. */
export function summarize(rows: BenchRow[], configs: BenchConfig[]): BenchSummary[] {
  const byGraph = new Map<string, BenchRow[]>();
  for (const row of rows) {
    const list = byGraph.get(row.graph) ?? [];
    list.push(row);
    byGraph.set(row.graph, list);
  }
  const sums = new Map<string, { rank: number; count: number; wins: number }>(configs.map((c) => [c.id, { rank: 0, count: 0, wins: 0 }]));
  for (const list of byGraph.values()) {
    const graphRank = new Map<string, number>(list.map((r) => [r.config, 0]));
    for (const m of METRICS) {
      for (const row of list) {
        const better = list.filter((o) => o.stats[m] < row.stats[m]).length;
        graphRank.set(row.config, graphRank.get(row.config)! + better + 1);
        const s = sums.get(row.config)!;
        s.rank += better + 1;
        s.count++;
      }
    }
    const best = Math.min(...graphRank.values());
    for (const [c, v] of graphRank) if (v === best) sums.get(c)!.wins++;
  }
  return configs
    .map((c) => {
      const mine = rows.filter((r) => r.config === c.id);
      const totals = Object.fromEntries(METRICS.map((m) => [m, mine.reduce((s, r) => s + r.stats[m], 0)])) as Record<Metric, number>;
      const s = sums.get(c.id)!;
      return {
        config: c.id,
        totals,
        meanRank: s.count ? s.rank / s.count : 0,
        wins: s.wins,
        ms: Math.round(mine.reduce((t, r) => t + r.stats.ms, 0)),
      };
    })
    .sort((a, b) => a.meanRank - b.meanRank);
}
