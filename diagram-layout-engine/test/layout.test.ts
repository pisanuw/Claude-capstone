import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/examples';
import { countBends, layoutChart, segmentHitsRect } from '../src/core/layout';
import { approxMeasurer, measureLabel } from '../src/core/measure';
import { parse } from '../src/core/parser';
import { roundedPath } from '../src/core/route';
import { clipToOutline, nodeSize, outline } from '../src/core/shapes';
import type { Layout, LayoutOptions } from '../src/core/types';

const boxesOverlap = (L: Layout): string[] => {
  const bad: string[] = [];
  for (let i = 0; i < L.nodes.length; i++)
    for (let j = i + 1; j < L.nodes.length; j++) {
      const a = L.nodes[i];
      const b = L.nodes[j];
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 0.5) bad.push(`${a.id}/${b.id}`);
    }
  return bad;
};

const inside = (L: Layout): boolean =>
  L.nodes.every((n) => n.x - n.width / 2 >= -0.5 && n.y - n.height / 2 >= -0.5 && n.x + n.width / 2 <= L.width + 0.5 && n.y + n.height / 2 <= L.height + 0.5);

describe('layoutChart', () => {
  it('lays a chain out along the flow direction', () => {
    const chart = parse('flowchart TD\nA --> B --> C');
    const L = layoutChart(chart);
    const [a, b, c] = L.nodes;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    expect(a.x).toBeCloseTo(c.x, 6);
    expect(L.stats).toMatchObject({ nodes: 3, edges: 2, layers: 3, reversed: 0, crossings: 0, dummies: 0 });
    for (const [dir, test] of [
      ['BT', (L: Layout) => L.nodes[0].y > L.nodes[2].y],
      ['LR', (L: Layout) => L.nodes[0].x < L.nodes[2].x],
      ['RL', (L: Layout) => L.nodes[0].x > L.nodes[2].x],
    ] as const) {
      expect(test(layoutChart(parse(`flowchart ${dir}\nA --> B --> C`)))).toBe(true);
    }
  });

  it('honours a direction override', () => {
    const L = layoutChart(parse('flowchart TD\nA --> B'), { direction: 'LR' });
    expect(L.direction).toBe('LR');
    expect(L.nodes[0].x).toBeLessThan(L.nodes[1].x);
  });

  it('starts and ends edges on node borders, with arrows the right way round', () => {
    const L = layoutChart(parse('flowchart TD\nA[Start] --> B{Choice}\nB --> A'));
    const fwd = L.edges[0];
    const back = L.edges[1];
    const a = L.nodes.find((n) => n.id === 'A')!;
    const b = L.nodes.find((n) => n.id === 'B')!;
    expect(fwd.points[0].y).toBeCloseTo(a.y + a.height / 2, 0);
    expect(fwd.points[fwd.points.length - 1].y).toBeLessThan(b.y);
    expect(back.reversed).toBe(true);
    expect(back.points[0].y).toBeGreaterThan(back.points[back.points.length - 1].y);
    expect(L.stats.reversed).toBe(1);
  });

  it('places labels on the middle dummy of labelled edges', () => {
    const L = layoutChart(parse('flowchart TD\nA -->|a long label| B'));
    const e = L.edges[0];
    expect(e.labelPos).not.toBeNull();
    expect(e.labelPos!.y).toBeGreaterThan(L.nodes[0].y);
    expect(e.labelPos!.y).toBeLessThan(L.nodes[1].y);
    expect(e.labelWidth).toBeGreaterThan(60);
  });

  it('draws self-loops beside the node and reserves space for them', () => {
    const L = layoutChart(parse('flowchart TD\nA -->|again| A\nA --> B\nC --> B'));
    const loop = L.edges.find((e) => e.selfLoop)!;
    const a = L.nodes.find((n) => n.id === 'A')!;
    expect(loop.points[1].x).toBeGreaterThan(a.x + a.width / 2);
    expect(loop.labelPos!.x).toBeGreaterThan(a.x + a.width / 2);
    expect(boxesOverlap(L)).toEqual([]);
    const lr = layoutChart(parse('flowchart LR\nA --> A'));
    expect(lr.edges[0].points[1].y).toBeGreaterThan(lr.nodes[0].y + lr.nodes[0].height / 2);
  });

  it('keeps subgraphs around their nodes and in their own direction', () => {
    const chart = parse(`flowchart TD
X --> a1
subgraph S [Row]
  direction LR
  a1 --> a2 --> a3
end
a3 --> Y`);
    const L = layoutChart(chart);
    const s = L.clusters[0];
    const ns = L.nodes.filter((n) => n.parent === 'S');
    for (const n of ns) {
      expect(n.x - n.width / 2).toBeGreaterThanOrEqual(s.x);
      expect(n.x + n.width / 2).toBeLessThanOrEqual(s.x + s.width);
      expect(n.y - n.height / 2).toBeGreaterThanOrEqual(s.y);
      expect(n.y + n.height / 2).toBeLessThanOrEqual(s.y + s.height);
    }
    expect(ns[0].x).toBeLessThan(ns[1].x);
    expect(ns[0].y).toBeCloseTo(ns[1].y, 6);
    expect(s.direction).toBe('LR');
    const x = L.nodes.find((n) => n.id === 'X')!;
    expect(x.y).toBeLessThan(s.y);
    // The edge into the subgraph ends on a1.
    const into = L.edges.find((e) => e.to === 'a1')!;
    const a1 = ns[0];
    const end = into.points[into.points.length - 1];
    expect(Math.abs(end.x - a1.x) <= a1.width / 2 + 0.5 && Math.abs(end.y - a1.y) <= a1.height / 2 + 0.5).toBe(true);
  });

  it('routes a leg around a sibling node that blocks the straight line', () => {
    const chart = parse(`flowchart TD
subgraph S
  top[A wide node sitting on top] --> low[low]
end
low --> out
out --> low`);
    const L = layoutChart(chart);
    const up = L.edges.find((e) => e.from === 'out' && e.to === 'low')!;
    expect(up.points.length).toBeGreaterThan(2);
    const top = L.nodes.find((n) => n.id === 'top')!;
    for (const p of up.points) {
      const inTop = Math.abs(p.x - top.x) < top.width / 2 - 1 && Math.abs(p.y - top.y) < top.height / 2 - 1;
      expect(inTop).toBe(false);
    }
  });

  it('supports edges to and from a subgraph itself', () => {
    const L = layoutChart(parse('flowchart LR\nA --> S\nsubgraph S\n  B\nend\nS --> C'));
    expect(L.edges).toHaveLength(2);
    const s = L.clusters[0];
    expect(L.edges[0].points[L.edges[0].points.length - 1].x).toBeCloseTo(s.x, 0);
  });

  it('fans out parallel edges', () => {
    const L = layoutChart(parse('flowchart TD\nA --> B\nA --> B\nA --> B'), { route: 'polyline' });
    const mids = L.edges.map((e) => e.path);
    expect(new Set(mids).size).toBe(3);
  });

  it('does not draw invisible links but uses them for layout', () => {
    const L = layoutChart(parse('flowchart LR\nA ~~~ B'));
    expect(L.nodes[0].x).toBeLessThan(L.nodes[1].x);
    expect(L.stats.edgeLength).toBe(0);
  });

  it('handles an empty diagram and an empty subgraph', () => {
    const L = layoutChart(parse('flowchart TD'));
    expect(L.nodes).toHaveLength(0);
    expect(L.width).toBeGreaterThan(0);
    const E = layoutChart(parse('flowchart TD\nsubgraph S [Empty]\nend\nA --> S'));
    expect(E.clusters[0].width).toBeGreaterThanOrEqual(60);
  });

  it('records the pipeline stages when asked', () => {
    const L = layoutChart(parse('flowchart TD\nA --> B --> C\nA --> C\nC --> A'), { record: true });
    const s = L.stages!;
    expect(s.orders.length).toBeGreaterThan(0);
    expect(Object.keys(s.ranks)).toEqual(['A', 'B', 'C']);
    expect(s.edges.filter((e) => e.reversed)).toHaveLength(1);
    expect(s.properEdges.length).toBeGreaterThanOrEqual(4);
    expect(s.positions.A).toBeDefined();
    expect(layoutChart(parse('flowchart TD\nA')).stages).toBeNull();
  });

  const OPTION_SETS: Partial<LayoutOptions>[] = [
    {},
    { route: 'orthogonal' },
    { route: 'polyline', position: 'priority' },
    { rank: 'longest-path', order: 'barycenter', transpose: false, cycle: 'dfs' },
  ];

  for (const ex of EXAMPLES) {
    it(`example '${ex.id}' lays out cleanly with every option set`, () => {
      const chart = parse(ex.source);
      for (const o of OPTION_SETS) {
        const L = layoutChart(chart, o);
        expect(boxesOverlap(L)).toEqual([]);
        expect(inside(L)).toBe(true);
        for (const e of L.edges) {
          expect(e.path).toMatch(/^M/);
          expect(e.path).not.toMatch(/NaN|Infinity/);
        }
      }
    });
  }

  it('is deterministic', () => {
    const chart = parse(EXAMPLES[2].source);
    const a = layoutChart(chart);
    const b = layoutChart(chart);
    expect(a.edges.map((e) => e.path)).toEqual(b.edges.map((e) => e.path));
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });

  it('network simplex gives shorter total edges than longest path on the curriculum', () => {
    const chart = parse(EXAMPLES.find((e) => e.id === 'curriculum')!.source);
    const ns = layoutChart(chart, { rank: 'network-simplex' });
    const lp = layoutChart(chart, { rank: 'longest-path' });
    expect(ns.stats.dummies).toBeLessThan(lp.stats.dummies);
  });
});

describe('geometry helpers', () => {
  it('clips rays to shape outlines', () => {
    const poly = outline('rect', 100, 40);
    expect(clipToOutline({ x: 0, y: 0 }, poly, { x: 0, y: 100 })).toEqual({ x: 0, y: 20 });
    expect(clipToOutline({ x: 0, y: 0 }, poly, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    const d = clipToOutline({ x: 0, y: 0 }, outline('diamond', 100, 50), { x: 100, y: 0 });
    expect(d.x).toBeCloseTo(50, 6);
    const c = clipToOutline({ x: 0, y: 0 }, outline('circle', 40, 40), { x: 0, y: -100 });
    expect(Math.hypot(c.x, c.y)).toBeGreaterThan(19);
  });

  it('sizes every shape around its label', () => {
    const tb = measureLabel('Hello world', approxMeasurer);
    for (const shape of ['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'doublecircle', 'diamond', 'hexagon', 'parallelogram', 'asymmetric'] as const) {
      const s = nodeSize(shape, tb.width, tb.height);
      expect(s.width).toBeGreaterThan(tb.width);
      expect(s.height).toBeGreaterThan(tb.height);
      expect(outline(shape, s.width, s.height).length).toBeGreaterThanOrEqual(4);
    }
    expect(measureLabel('', approxMeasurer)).toEqual({ lines: [], width: 0, height: 0 });
    expect(approxMeasurer.width('東京')).toBeGreaterThan(approxMeasurer.width('ab'));
  });

  it('clips segments against rectangles', () => {
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, 0, 0, 10, 10)).toBe(true);
    expect(segmentHitsRect({ x: -5, y: 15 }, { x: 15, y: 15 }, 0, 0, 10, 10)).toBe(false);
    expect(segmentHitsRect({ x: 5, y: -5 }, { x: 5, y: -1 }, 0, 0, 10, 10)).toBe(false);
    expect(segmentHitsRect({ x: -5, y: -5 }, { x: 20, y: 20 }, 0, 0, 10, 10)).toBe(true);
  });

  it('moves a subgraph title out of the way of an entering edge', () => {
    const L = layoutChart(parse('flowchart TD\nX --> a\nsubgraph S [Title]\n  direction LR\n  a --> b --> c\nend'));
    expect(L.clusters[0].titleAnchor).not.toBe('start');
    const free = layoutChart(parse('flowchart TD\nsubgraph S [Title]\n  a\nend'));
    expect(free.clusters[0].titleAnchor).toBe('start');
    expect(layoutChart(parse('flowchart TD\nsubgraph S [" "]\n  a\nend')).clusters[0].titleAnchor).toBe('start');
  });

  it('counts bends and rounds orthogonal corners', () => {
    expect(countBends([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }])).toBe(1);
    expect(countBends([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }])).toBe(0);
    const d = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }], 6);
    expect(d).toBe('M0,0L0,14Q0,20 6,20L20,20');
  });
});
