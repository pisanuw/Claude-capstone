// Edge routing in absolute coordinates, after every scope has been placed.
//
// A route from the layered step runs between the representatives of its
// endpoints in the scope where it was laid out (a node or a whole subgraph
// box). When an endpoint sits inside a subgraph box, a leg connects the real
// node to a port on the box border: straight if that line is clear, otherwise
// an elbow through the nearest free lane between the box's other nodes.

import type { Band } from './layered';
import { horizontal } from './layered';
import { clipToOutline, outline, r } from './shapes';
import type { Direction, NodeShape, Point } from './types';

export interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape | 'cluster';
}

export interface RouteInput {
  id: string;
  from: string;
  to: string;
  fromRep: string;
  toRep: string;
  dir: Direction;
  scope: string;
  /** Centres from the start representative to the end one, through dummies. */
  points: Point[];
  ranks: number[];
  bands: Band[];
}

export interface Prepared {
  input: RouteInput;
  /** Core polyline: first/last are a port (fixed) or a node centre (to clip). */
  core: Point[];
  startFixed: boolean;
  endFixed: boolean;
  /** Leg from the inner node's border to the start port, or null. */
  startLeg: Point[] | null;
  /** Leg from the end port to the inner node's border, or null. */
  endLeg: Point[] | null;
}

export type RouteMethod = 'spline' | 'polyline' | 'orthogonal';

const swap = (p: Point): Point => ({ x: p.y, y: p.x });
const swapGeo = (g: Geo): Geo => ({ ...g, x: g.y, y: g.x, width: g.height, height: g.width });

export function clipAt(g: Geo, from: Point, toward: Point): Point {
  const poly = outline(g.shape, g.width, g.height).map((p) => ({ x: p.x + g.x - from.x, y: p.y + g.y - from.y }));
  return clipToOutline(from, poly, toward);
}

function hitsBox(a: Point, b: Point, g: Geo, pad = 3): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x1 > g.x - g.width / 2 - pad && x0 < g.x + g.width / 2 + pad && y1 > g.y - g.height / 2 - pad && y0 < g.y + g.height / 2 + pad;
}

/**
 * Leg from `inner` to the border of `box` on the side facing `toward`, in a
 * top-to-bottom frame (callers swap axes for horizontal scopes). Returns the
 * port and the leg polyline from the inner node's border to the port.
 */
export function planLeg(inner: Geo, box: Geo, toward: Point, obstacles: Geo[]): { port: Point; leg: Point[] } {
  const down = toward.y > box.y;
  const side = down ? box.y + box.height / 2 : box.y - box.height / 2;
  const lo = box.x - box.width / 2 + 8;
  const hi = box.x + box.width / 2 - 8;
  const clamp = (x: number): number => Math.min(hi, Math.max(lo, x));
  const lanes = [inner.x, lo, hi];
  for (const o of obstacles) lanes.push(o.x - o.width / 2 - 10, o.x + o.width / 2 + 10);
  const seen = new Set<number>();
  const candidates = lanes
    .map(clamp)
    .filter((x) => {
      const k = Math.round(x * 10);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Math.abs(a - inner.x) - Math.abs(b - inner.x));
  const clear = (a: Point, b: Point): boolean => !obstacles.some((o) => hitsBox(a, b, o));
  for (const x of candidates) {
    const port = { x, y: side };
    const straight = inner.shape === 'diamond' || inner.shape === 'circle' || inner.shape === 'doublecircle' ? inner.width / 4 : inner.width / 2 - 2;
    if (Math.abs(x - inner.x) < straight) {
      // Straight out of the facing side.
      const start = clipAt(inner, { x, y: inner.y }, { x, y: down ? inner.y + 1e4 : inner.y - 1e4 });
      if (clear(start, port)) return { port, leg: [start, port] };
      continue;
    }
    const elbow = { x, y: inner.y };
    const start = clipAt(inner, { x: inner.x, y: inner.y }, elbow);
    if (clear(start, elbow) && clear(elbow, port)) return { port, leg: [start, elbow, port] };
  }
  const x = clamp(inner.x);
  const start = clipAt(inner, { x, y: inner.y }, { x, y: down ? inner.y + 1e4 : inner.y - 1e4 });
  return { port: { x, y: side }, leg: [start, { x, y: side }] };
}

export function prepare(input: RouteInput, geo: Map<string, Geo>, obstaclesIn: (cluster: string, inner: string) => Geo[]): Prepared {
  const hz = horizontal(input.dir);
  const core = input.points.map((p) => ({ ...p }));
  const tb = (p: Point): Point => (hz ? swap(p) : p);
  const tg = (g: Geo): Geo => (hz ? swapGeo(g) : g);
  let startLeg: Point[] | null = null;
  let endLeg: Point[] | null = null;
  if (input.from !== input.fromRep) {
    const plan = planLeg(tg(geo.get(input.from)!), tg(geo.get(input.fromRep)!), tb(core[1]), obstaclesIn(input.fromRep, input.from).map(tg));
    core[0] = tb(plan.port);
    startLeg = plan.leg.map(tb);
  }
  if (input.to !== input.toRep) {
    const n = core.length;
    const plan = planLeg(tg(geo.get(input.to)!), tg(geo.get(input.toRep)!), tb(core[n - 2]), obstaclesIn(input.toRep, input.to).map(tg));
    core[n - 1] = tb(plan.port);
    endLeg = plan.leg.map(tb).reverse();
  }
  return { input, core, startFixed: startLeg !== null, endFixed: endLeg !== null, startLeg, endLeg };
}

function crossRange(g: Geo, hz: boolean): number {
  const half = hz ? g.height / 2 : g.width / 2;
  const f = g.shape === 'diamond' || g.shape === 'circle' || g.shape === 'doublecircle' || g.shape === 'hexagon' ? 0.25 : 0.6;
  return half * f;
}

/** Core points with orthogonal ports: straight out of the side facing the neighbour. */
function orthoCore(p: Prepared, geo: Map<string, Geo>, offset: number): Point[] {
  const hz = horizontal(p.input.dir);
  const pts = shiftCore(p, offset);
  const fix = (idx: number, nb: Point, g: Geo): void => {
    const range = crossRange(g, hz);
    if (!hz) {
      const x = Math.min(g.x + range, Math.max(g.x - range, nb.x));
      pts[idx] = clipAt(g, { x, y: g.y }, { x, y: nb.y > g.y ? g.y + 1e4 : g.y - 1e4 });
    } else {
      const y = Math.min(g.y + range, Math.max(g.y - range, nb.y));
      pts[idx] = clipAt(g, { x: g.x, y }, { x: nb.x > g.x ? g.x + 1e4 : g.x - 1e4, y });
    }
  };
  if (!p.startFixed) fix(0, pts[1], geo.get(p.input.fromRep)!);
  if (!p.endFixed) fix(pts.length - 1, pts[pts.length - 2], geo.get(p.input.toRep)!);
  return pts;
}

function shiftCore(p: Prepared, offset: number): Point[] {
  const hz = horizontal(p.input.dir);
  return p.core.map((q, k) => {
    // Parallel edges fan out; ports on subgraph borders stay put.
    if (!offset || (k === 0 && p.startFixed) || (k === p.core.length - 1 && p.endFixed)) return { ...q };
    return hz ? { x: q.x, y: q.y + offset } : { x: q.x + offset, y: q.y };
  });
}

/** Track (0..1 across the channel) for every bending segment of orthogonal routes. */
export function assignTracks(prepared: Prepared[], geo: Map<string, Geo>): Map<string, number> {
  const tracks = new Map<string, number>();
  const channels = new Map<string, { key: string; lo: number; hi: number }[]>();
  for (const p of prepared) {
    const hz = horizontal(p.input.dir);
    const pts = orthoCore(p, geo, 0);
    for (let k = 0; k + 1 < pts.length; k++) {
      const ca = hz ? pts[k].y : pts[k].x;
      const cb = hz ? pts[k + 1].y : pts[k + 1].x;
      if (Math.abs(ca - cb) < 0.5) continue;
      const ch = `${p.input.scope}\u0000${Math.min(p.input.ranks[k], p.input.ranks[k + 1])}`;
      const list = channels.get(ch) ?? [];
      list.push({ key: `${p.input.id}:${k}`, lo: Math.min(ca, cb), hi: Math.max(ca, cb) });
      channels.set(ch, list);
    }
  }
  for (const list of channels.values()) {
    list.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    list.forEach((s, k) => tracks.set(s.key, (k + 1) / (list.length + 1)));
  }
  return tracks;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) continue;
    out.push(p);
  }
  return out.filter((p, k) => {
    if (k === 0 || k === out.length - 1) return true;
    const a = out[k - 1];
    const b = out[k + 1];
    return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) > 0.01;
  });
}

export function roundedPath(points: Point[], radius: number, move = true): string {
  let d = move ? `M${r(points[0].x)},${r(points[0].y)}` : '';
  for (let k = 1; k + 1 < points.length; k++) {
    const p = points[k];
    const a = points[k - 1];
    const b = points[k + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const rr = Math.min(radius, la / 2, lb / 2);
    const p1 = { x: p.x + ((a.x - p.x) / la) * rr, y: p.y + ((a.y - p.y) / la) * rr };
    const p2 = { x: p.x + ((b.x - p.x) / lb) * rr, y: p.y + ((b.y - p.y) / lb) * rr };
    d += `L${r(p1.x)},${r(p1.y)}Q${r(p.x)},${r(p.y)} ${r(p2.x)},${r(p2.y)}`;
  }
  if (points.length > 1) {
    const z = points[points.length - 1];
    d += `L${r(z.x)},${r(z.y)}`;
  }
  return d;
}

export function buildRoute(p: Prepared, geo: Map<string, Geo>, method: RouteMethod, tracks: Map<string, number>, offset: number): { points: Point[]; path: string } {
  const hz = horizontal(p.input.dir);
  const from = geo.get(p.input.fromRep)!;
  const to = geo.get(p.input.toRep)!;
  let core: Point[];
  let corePath: string;
  if (method === 'orthogonal') {
    const pts = orthoCore(p, geo, offset);
    const poly: Point[] = [pts[0]];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const ca = hz ? a.y : a.x;
      const cb = hz ? b.y : b.x;
      if (Math.abs(ca - cb) >= 0.5) {
        const t = tracks.get(`${p.input.id}:${k}`) ?? 0.5;
        const bandA = p.input.bands[p.input.ranks[k]];
        const bandB = p.input.bands[p.input.ranks[k + 1]];
        const ra = hz ? a.x : a.y;
        const rb = hz ? b.x : b.y;
        const forward = rb > ra;
        const g0 = forward ? Math.max(bandA.hi, ra) : Math.min(bandA.lo, ra);
        const g1 = forward ? Math.min(bandB.lo, rb) : Math.max(bandB.hi, rb);
        const m = g0 + (g1 - g0) * t;
        if (!hz) poly.push({ x: a.x, y: m }, { x: b.x, y: m });
        else poly.push({ x: m, y: a.y }, { x: m, y: b.y });
      }
      poly.push(b);
    }
    core = dedupe(poly);
    corePath = roundedPath(core, 6);
  } else {
    const pts = shiftCore(p, offset);
    const n = pts.length;
    if (!p.startFixed) pts[0] = clipAt(from, pts[0], pts[1]);
    if (!p.endFixed) pts[n - 1] = clipAt(to, pts[n - 1], pts[n - 2]);
    core = pts;
    if (method === 'polyline') {
      corePath = pts.map((q, k) => `${k ? 'L' : 'M'}${r(q.x)},${r(q.y)}`).join('');
    } else {
      corePath = `M${r(pts[0].x)},${r(pts[0].y)}`;
      for (let k = 0; k + 1 < n; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        if (!hz) {
          const my = (a.y + b.y) / 2;
          corePath += `C${r(a.x)},${r(my)} ${r(b.x)},${r(my)} ${r(b.x)},${r(b.y)}`;
        } else {
          const mx = (a.x + b.x) / 2;
          corePath += `C${r(mx)},${r(a.y)} ${r(mx)},${r(b.y)} ${r(b.x)},${r(b.y)}`;
        }
      }
    }
  }
  // Legs are orthogonal in every mode; one continuous path keeps markers right.
  const all = [...(p.startLeg ?? []), ...core.slice(p.startLeg ? 1 : 0), ...(p.endLeg ? p.endLeg.slice(1) : [])];
  let path = '';
  if (p.startLeg) path += roundedPath(p.startLeg, 6) + corePath.replace(/^M[^LCQ]+/, '');
  else path += corePath;
  if (p.endLeg) path += roundedPath(p.endLeg, 6, false);
  return { points: all, path };
}
