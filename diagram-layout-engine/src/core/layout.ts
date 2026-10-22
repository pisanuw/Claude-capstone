// Full diagram layout. Subgraphs are laid out bottom-up: each one runs the
// layered pipeline on its own children in its own direction and then becomes
// a single box in its parent. Edges are laid out in the scope of the lowest
// common subgraph of their endpoints; an endpoint deeper inside a child
// subgraph gets a straight leg from the node to a port on that subgraph's
// border. Routing (spline, polyline or orthogonal) happens last, in absolute
// coordinates.

import { horizontal, layered, type Band, type Box, type BoxEdge, type Route } from './layered';
import { approxMeasurer, measureLabel, type TextMeasurer } from './measure';
import { assignTracks, buildRoute, prepare, type Geo, type RouteMethod } from './route';
import { nodeSize, r } from './shapes';
import {
  DEFAULT_OPTIONS,
  type Direction,
  type FlowEdge,
  type Flowchart,
  type LaidOutCluster,
  type LaidOutEdge,
  type LaidOutNode,
  type Layout,
  type LayoutOptions,
  type Point,
  type StageRecord,
} from './types';

const CLUSTER_PAD = 16;
const LOOP = 34;

interface ScopeResult {
  width: number;
  height: number;
  nodes: Map<string, Point>;
  clusters: Map<string, { x: number; y: number; width: number; height: number; direction: Direction; depth: number }>;
  routes: { edge: FlowEdge; route: Route; fromRep: string; toRep: string; dir: Direction; bands: Band[]; scope: string }[];
  ranks: Map<string, { rank: number; order: number }>;
  stats: { layers: number; dummies: number; reversed: number; crossings: number };
  stage: StageRecord | null;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function layoutChart(chart: Flowchart, options: Partial<LayoutOptions> = {}, measurer: TextMeasurer = approxMeasurer): Layout {
  const t0 = now();
  const opts: LayoutOptions = { ...DEFAULT_OPTIONS, ...options };
  const rootDir = opts.direction ?? chart.direction;

  // Children of each scope ('' is the root), in source order.
  const kids = new Map<string, { nodes: string[]; subs: string[] }>([['', { nodes: [], subs: [] }]]);
  for (const id of chart.subgraphs.keys()) kids.set(id, { nodes: [], subs: [] });
  for (const n of chart.nodes.values()) kids.get(n.parent ?? '')!.nodes.push(n.id);
  for (const s of chart.subgraphs.values()) kids.get(s.parent ?? '')!.subs.push(s.id);

  const parentOf = (id: string): string => chart.nodes.get(id)?.parent ?? chart.subgraphs.get(id)?.parent ?? '';
  const chainOf = (id: string): string[] => {
    const out = [id];
    let p = parentOf(id);
    while (p) {
      out.push(p);
      p = parentOf(p);
    }
    out.push('');
    return out;
  };
  // Lowest common scope and the representative child of that scope per end.
  const edgeScope = new Map<string, { scope: string; fromRep: string; toRep: string }>();
  for (const e of chart.edges) {
    const a = chainOf(e.from);
    const b = chainOf(e.to);
    const bs = new Set(b);
    let k = 0;
    while (!bs.has(a[k])) k++;
    const scope = a[k];
    const j = b.indexOf(scope);
    // One end contains the other (possible in a diff union): nothing to draw.
    if (e.from !== e.to && (k === 0 || j === 0)) continue;
    // Self-loops sit in the parent scope of their node.
    if (e.from === e.to) edgeScope.set(e.id, { scope: parentOf(e.from), fromRep: e.from, toRep: e.to });
    else edgeScope.set(e.id, { scope, fromRep: a[k - 1], toRep: b[j - 1] });
  }

  const sizes = new Map<string, { width: number; height: number; lines: string[] }>();
  for (const n of chart.nodes.values()) {
    const tb = measureLabel(n.label, measurer);
    sizes.set(n.id, { ...nodeSize(n.shape, tb.width, tb.height), lines: tb.lines });
  }
  const labelBox = (label: string): { w: number; h: number; lines: string[] } => {
    if (!label) return { w: 0, h: 0, lines: [] };
    const tb = measureLabel(label, measurer);
    return { w: tb.width + 10, h: tb.height + 4, lines: tb.lines };
  };

  const loopPad = new Map<string, number>();
  for (const e of chart.edges) {
    if (e.from !== e.to) continue;
    const lb = labelBox(e.label);
    const dir = scopeDir(parentOf(e.from));
    loopPad.set(e.from, (loopPad.get(e.from) ?? 0) + LOOP + (horizontal(dir) ? lb.h : lb.w));
  }

  function scopeDir(scope: string): Direction {
    if (!scope) return rootDir;
    return chart.subgraphs.get(scope)!.direction ?? scopeDir(parentOf(scope));
  }

  const results = new Map<string, ScopeResult>();

  function layoutScope(scope: string, depth: number): ScopeResult {
    const dir = scopeDir(scope);
    const k = kids.get(scope)!;
    for (const s of k.subs) results.set(s, layoutScope(s, depth + 1));
    const boxes: Box[] = [];
    for (const id of k.nodes) {
      const s = sizes.get(id)!;
      boxes.push({ id, label: chart.nodes.get(id)!.label, width: s.width, height: s.height, loopPad: loopPad.get(id) ?? 0, cluster: false });
    }
    for (const id of k.subs) {
      const sub = results.get(id)!;
      const sg = chart.subgraphs.get(id)!;
      const title = measureLabel(sg.title, measurer);
      const titleH = title.height ? title.height + 6 : 0;
      boxes.push({
        id,
        label: sg.title,
        width: Math.max(sub.width + 2 * CLUSTER_PAD, title.width + 2 * CLUSTER_PAD, 60),
        height: Math.max(sub.height + 2 * CLUSTER_PAD + titleH, 40),
        loopPad: 0,
        cluster: true,
      });
    }
    const scopeEdges = chart.edges.filter((e) => edgeScope.get(e.id)?.scope === scope && e.from !== e.to);
    const boxEdges: BoxEdge[] = scopeEdges.map((e) => {
      const s = edgeScope.get(e.id)!;
      const lb = labelBox(e.label);
      return { id: e.id, v: s.fromRep, w: s.toRep, minlen: e.minlen, weight: 1, labelW: lb.w, labelH: lb.h };
    });
    const res = layered(boxes, boxEdges, dir, opts, opts.record && scope === '');
    const out: ScopeResult = {
      width: res.width,
      height: res.height,
      nodes: new Map(),
      clusters: new Map(),
      routes: [],
      ranks: new Map(),
      stats: { ...res.stats },
      stage: res.stage,
    };
    for (const id of k.nodes) {
      out.nodes.set(id, res.pos.get(id)!);
      out.ranks.set(id, { rank: res.rank.get(id)!, order: res.order.get(id)! });
    }
    for (const id of k.subs) {
      const p = res.pos.get(id)!;
      const box = boxes.find((b) => b.id === id)!;
      const sub = results.get(id)!;
      const sg = chart.subgraphs.get(id)!;
      const title = measureLabel(sg.title, measurer);
      const titleH = title.height ? title.height + 6 : 0;
      const ox = p.x - box.width / 2 + (box.width - sub.width) / 2;
      const oy = p.y - box.height / 2 + CLUSTER_PAD + titleH + (box.height - 2 * CLUSTER_PAD - titleH - sub.height) / 2;
      out.clusters.set(id, { x: p.x, y: p.y, width: box.width, height: box.height, direction: scopeDir(id), depth });
      out.ranks.set(id, { rank: res.rank.get(id)!, order: res.order.get(id)! });
      // Pull the child's content into this scope's coordinates.
      for (const [n, q] of sub.nodes) out.nodes.set(n, { x: q.x + ox, y: q.y + oy });
      for (const [c, q] of sub.clusters) out.clusters.set(c, { ...q, x: q.x + ox, y: q.y + oy });
      for (const [n, rk] of sub.ranks) out.ranks.set(n, rk);
      for (const rt of sub.routes) {
        out.routes.push({
          ...rt,
          route: {
            ...rt.route,
            points: rt.route.points.map((q) => ({ x: q.x + ox, y: q.y + oy })),
            labelPos: rt.route.labelPos && { x: rt.route.labelPos.x + ox, y: rt.route.labelPos.y + oy },
          },
          bands: rt.bands.map((b) => (horizontal(rt.dir) ? { lo: b.lo + ox, hi: b.hi + ox } : { lo: b.lo + oy, hi: b.hi + oy })),
        });
      }
      out.stats.dummies += sub.stats.dummies;
      out.stats.reversed += sub.stats.reversed;
      out.stats.crossings += sub.stats.crossings;
      out.stats.layers = Math.max(out.stats.layers, sub.stats.layers);
    }
    for (const e of scopeEdges) {
      const s = edgeScope.get(e.id)!;
      out.routes.push({ edge: e, route: res.routes.get(e.id)!, fromRep: s.fromRep, toRep: s.toRep, dir, bands: res.bands, scope });
    }
    return out;
  }

  const root = layoutScope('', 0);

  // Absolute geometry of every node and cluster, used for clipping.
  const geo = new Map<string, Geo>();
  for (const [id, p] of root.nodes) {
    const s = sizes.get(id)!;
    geo.set(id, { x: p.x, y: p.y, width: s.width, height: s.height, shape: chart.nodes.get(id)!.shape });
  }
  for (const [id, c] of root.clusters) geo.set(id, { x: c.x, y: c.y, width: c.width, height: c.height, shape: 'cluster' });

  // Nodes and boxes inside each subgraph, for routing legs around them.
  const inside = new Map<string, string[]>();
  for (const id of [...chart.nodes.keys(), ...chart.subgraphs.keys()]) {
    for (const anc of chainOf(id).slice(1, -1)) {
      const list = inside.get(anc) ?? [];
      list.push(id);
      inside.set(anc, list);
    }
  }
  const obstacles = (cluster: string, inner: string): Geo[] => {
    const holders = new Set(chainOf(inner));
    return (inside.get(cluster) ?? []).filter((id) => !holders.has(id)).map((id) => geo.get(id)!);
  };

  const edgesOut: LaidOutEdge[] = [];
  const prepared = root.routes.map((rt) =>
    prepare(
      {
        id: rt.edge.id,
        from: rt.edge.from,
        to: rt.edge.to,
        fromRep: rt.fromRep,
        toRep: rt.toRep,
        dir: rt.dir,
        scope: rt.scope,
        points: rt.route.points,
        ranks: rt.route.ranks,
        bands: rt.bands,
      },
      geo,
      obstacles,
    ),
  );
  const tracks = opts.route === 'orthogonal' ? assignTracks(prepared, geo) : new Map<string, number>();
  const parallel = new Map<string, number>();
  root.routes.forEach((rt, i) => {
    const e = rt.edge;
    const k = [e.from, e.to].sort().join('\u0000');
    const idx = parallel.get(k) ?? 0;
    parallel.set(k, idx + 1);
    const lb = labelBox(e.label);
    const offset = idx === 0 ? 0 : (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * 12;
    const routed = buildRoute(prepared[i], geo, opts.route as RouteMethod, tracks, offset);
    let labelPos = rt.route.labelPos ? { ...rt.route.labelPos } : null;
    if (labelPos && offset) labelPos = horizontal(rt.dir) ? { x: labelPos.x, y: labelPos.y + offset } : { x: labelPos.x + offset, y: labelPos.y };
    edgesOut.push({
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.label,
      lines: lb.lines,
      line: e.line,
      head: e.head,
      tail: e.tail,
      points: routed.points,
      path: routed.path,
      labelPos,
      labelWidth: lb.w,
      labelHeight: lb.h,
      style: e.style,
      reversed: rt.route.reversed,
      selfLoop: false,
    });
  });
  // Self-loops on the side reserved for them.
  const loopsSeen = new Map<string, number>();
  for (const e of chart.edges) {
    if (e.from !== e.to) continue;
    const g = geo.get(e.from)!;
    const n = loopsSeen.get(e.from) ?? 0;
    loopsSeen.set(e.from, n + 1);
    const lb = labelBox(e.label);
    const hz = horizontal(scopeDir(parentOf(e.from)));
    const reach = LOOP - 6 + n * 14;
    let pts: Point[];
    let labelPos: Point | null = null;
    if (!hz) {
      const x0 = g.x + g.width / 2;
      const a = g.y - g.height / 4;
      const b = g.y + g.height / 4;
      pts = [
        { x: x0, y: a },
        { x: x0 + reach, y: a - 8 },
        { x: x0 + reach, y: b + 8 },
        { x: x0, y: b },
      ];
      if (lb.w) labelPos = { x: x0 + reach + lb.w / 2 + 2, y: g.y };
    } else {
      const y0 = g.y + g.height / 2;
      const a = g.x - g.width / 4;
      const b = g.x + g.width / 4;
      pts = [
        { x: b, y: y0 },
        { x: b + 8, y: y0 + reach },
        { x: a - 8, y: y0 + reach },
        { x: a, y: y0 },
      ];
      if (lb.w) labelPos = { x: g.x, y: y0 + reach + lb.h / 2 + 2 };
    }
    const path = `M${r(pts[0].x)},${r(pts[0].y)}C${r(pts[1].x)},${r(pts[1].y)} ${r(pts[2].x)},${r(pts[2].y)} ${r(pts[3].x)},${r(pts[3].y)}`;
    edgesOut.push({
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.label,
      lines: lb.lines,
      line: e.line,
      head: e.head,
      tail: e.tail,
      points: pts,
      path,
      labelPos,
      labelWidth: lb.w,
      labelHeight: lb.h,
      style: e.style,
      reversed: false,
      selfLoop: true,
    });
  }
  // Keep source order so linkStyle indices and the SVG agree.
  const edgeIndex = new Map(chart.edges.map((e, k) => [e.id, k]));
  edgesOut.sort((a, b) => edgeIndex.get(a.id)! - edgeIndex.get(b.id)!);

  const nodesOut: LaidOutNode[] = [...chart.nodes.values()].map((n) => {
    const g = geo.get(n.id)!;
    const rk = root.ranks.get(n.id)!;
    return {
      id: n.id,
      label: n.label,
      lines: sizes.get(n.id)!.lines,
      shape: n.shape,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      classes: n.classes,
      style: n.style,
      rank: rk.rank,
      order: rk.order,
      parent: n.parent,
    };
  });
  const clustersOut: LaidOutCluster[] = [...chart.subgraphs.values()].map((s) => {
    const c = root.clusters.get(s.id)!;
    return {
      id: s.id,
      title: s.title,
      x: c.x - c.width / 2,
      y: c.y - c.height / 2,
      width: c.width,
      height: c.height,
      direction: c.direction,
      depth: c.depth,
      classes: s.classes,
      style: s.style,
      titleAnchor: titleAnchor(c, measureLabel(s.title, measurer), edgesOut),
    };
  });
  // Outer subgraphs first so inner ones draw on top.
  clustersOut.sort((a, b) => a.depth - b.depth);

  // Bounding box including loops and labels, then shift to a margin.
  const MARGIN = 12;
  let minX = 0;
  let minY = 0;
  let maxX = root.width;
  let maxY = root.height;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of edgesOut) {
    for (const p of e.points) grow(p.x, p.y);
    if (e.labelPos) {
      grow(e.labelPos.x - e.labelWidth / 2, e.labelPos.y - e.labelHeight / 2);
      grow(e.labelPos.x + e.labelWidth / 2, e.labelPos.y + e.labelHeight / 2);
    }
  }
  const dx = MARGIN - minX;
  const dy = MARGIN - minY;
  for (const n of nodesOut) {
    n.x += dx;
    n.y += dy;
  }
  for (const c of clustersOut) {
    c.x += dx;
    c.y += dy;
  }
  for (const e of edgesOut) {
    e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    e.path = shiftPath(e.path, dx, dy);
    if (e.labelPos) e.labelPos = { x: e.labelPos.x + dx, y: e.labelPos.y + dy };
  }
  if (root.stage) {
    root.stage.positions = Object.fromEntries(Object.entries(root.stage.positions).map(([k, p]) => [k, { x: p.x + dx, y: p.y + dy }]));
  }
  const width = Math.ceil(maxX - minX + 2 * MARGIN);
  const height = Math.ceil(maxY - minY + 2 * MARGIN);

  let edgeLength = 0;
  let bends = 0;
  for (const e of edgesOut) {
    if (e.line === 'invisible') continue;
    for (let k = 1; k < e.points.length; k++) edgeLength += Math.hypot(e.points[k].x - e.points[k - 1].x, e.points[k].y - e.points[k - 1].y);
    if (!e.selfLoop) bends += countBends(e.points);
  }

  return {
    direction: rootDir,
    width,
    height,
    nodes: nodesOut,
    edges: edgesOut,
    clusters: clustersOut,
    stats: {
      nodes: chart.nodes.size,
      edges: chart.edges.length,
      layers: root.stats.layers,
      dummies: root.stats.dummies,
      reversed: root.stats.reversed,
      crossings: root.stats.crossings,
      area: width * height,
      edgeLength: Math.round(edgeLength),
      bends,
      ms: Math.round((now() - t0) * 10) / 10,
    },
    stages: root.stage,
  };
}

/** Does segment a-b pass through the rectangle? (Liang-Barsky clipping.) */
export function segmentHitsRect(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Put a subgraph title where no edge runs through it: left, then right, then centre. */
function titleAnchor(c: { x: number; y: number; width: number; height: number }, title: { width: number; height: number }, edges: LaidOutEdge[]): 'start' | 'middle' | 'end' {
  if (!title.width) return 'start';
  const left = c.x - c.width / 2;
  const top = c.y - c.height / 2;
  const spans: ['start' | 'middle' | 'end', number][] = [
    ['start', left + 10],
    ['end', left + c.width - 10 - title.width],
    ['middle', c.x - title.width / 2],
  ];
  for (const [anchor, x0] of spans) {
    const blocked = edges.some((e) => e.points.some((p, k) => k > 0 && segmentHitsRect(e.points[k - 1], p, x0 - 4, top + 2, x0 + title.width + 4, top + 6 + title.height)));
    if (!blocked) return anchor;
  }
  return 'start';
}

export function countBends(points: Point[]): number {
  let bends = 0;
  for (let k = 1; k + 1 < points.length; k++) {
    const a = Math.atan2(points[k].y - points[k - 1].y, points[k].x - points[k - 1].x);
    const b = Math.atan2(points[k + 1].y - points[k].y, points[k + 1].x - points[k].x);
    let d = Math.abs(a - b);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.09) bends++;
  }
  return bends;
}

function shiftPath(d: string, dx: number, dy: number): string {
  // Paths only use absolute M/L/C/Q commands with x,y pairs.
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${r(Number(x) + dx)},${r(Number(y) + dy)}`);
}
