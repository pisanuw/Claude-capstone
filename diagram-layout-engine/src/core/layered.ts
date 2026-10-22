// One run of the layered (Sugiyama) pipeline over a flat graph of boxes:
// cycle removal, layering, normalization with dummy nodes, crossing
// minimization, coordinate assignment, then a transform from the internal
// top-to-bottom frame into the requested direction.

import { feedbackEdges, type WEdge } from './acyclic';
import { minimizeCrossings, type PEdge } from './order';
import { brandesKopf, priorityLayout, type PNode } from './position';
import { longestPath, networkSimplex } from './rank';
import type { Direction, LayoutOptions, Point, StageRecord } from './types';

export interface Box {
  id: string;
  label: string;
  /** Size in the final orientation. */
  width: number;
  height: number;
  /** Room reserved beside the node for self-loops, along the cross axis. */
  loopPad: number;
  cluster: boolean;
}

export interface BoxEdge {
  id: string;
  v: string;
  w: string;
  minlen: number;
  weight: number;
  /** Label size in the final orientation (0 when unlabeled). */
  labelW: number;
  labelH: number;
}

export interface Route {
  edge: string;
  /** Centres from v to w in the original edge direction, through dummies. */
  points: Point[];
  /** Rank of each point. */
  ranks: number[];
  labelPos: Point | null;
  reversed: boolean;
}

export interface Band {
  /** Extent of the rank along the rank axis, final coordinates. */
  lo: number;
  hi: number;
}

export interface LayeredResult {
  width: number;
  height: number;
  pos: Map<string, Point>;
  rank: Map<string, number>;
  order: Map<string, number>;
  routes: Map<string, Route>;
  bands: Band[];
  stats: { layers: number; dummies: number; reversed: number; crossings: number };
  stage: StageRecord | null;
}

export const horizontal = (d: Direction): boolean => d === 'LR' || d === 'RL';

interface LNode extends PNode {
  height: number;
  rank: number;
}

export function layered(boxes: Box[], edges: BoxEdge[], dir: Direction, opts: LayoutOptions, record = false): LayeredResult {
  const hz = horizontal(dir);
  const ids = boxes.map((b) => b.id);
  const nodes = new Map<string, LNode>();
  for (const b of boxes) {
    nodes.set(b.id, {
      width: hz ? b.height : b.width,
      height: hz ? b.width : b.height,
      dummy: false,
      padRight: b.loopPad,
      rank: 0,
    });
  }

  // 1. Cycle removal (self-loops are drawn separately and skipped here).
  const loopFree = edges.filter((e) => e.v !== e.w);
  const doubled = loopFree.some((e) => e.labelW > 0);
  const wedges: WEdge[] = loopFree.map((e) => ({
    id: e.id,
    v: e.v,
    w: e.w,
    weight: e.weight,
    minlen: doubled ? e.minlen * 2 : e.minlen,
  }));
  const flip = feedbackEdges(ids, wedges, opts.cycle);
  const dag = wedges.map((e) => (flip.has(e.id) ? { ...e, v: e.w, w: e.v } : e));

  // 2. Layering.
  const rank = opts.rank === 'network-simplex' ? networkSimplex(ids, dag) : longestPath(ids, dag);
  for (const id of ids) nodes.get(id)!.rank = rank.get(id)!;
  const maxRank = ids.reduce((m, id) => Math.max(m, rank.get(id)!), 0);

  // 3. Normalization: split edges spanning several ranks with dummy nodes,
  // putting the label on the middle dummy.
  const proper: PEdge[] = [];
  const chains = new Map<string, string[]>();
  const labelDummy = new Map<string, string>();
  let dummies = 0;
  const byId = new Map(loopFree.map((e) => [e.id, e]));
  for (const e of dag) {
    const src = byId.get(e.id)!;
    const r0 = rank.get(e.v)!;
    const r1 = rank.get(e.w)!;
    const chain = [e.v];
    const mid = r0 + Math.floor((r1 - r0) / 2);
    for (let r = r0 + 1; r < r1; r++) {
      const d = `\u0000d${dummies++}`;
      const isLabel = src.labelW > 0 && r === mid;
      nodes.set(d, {
        width: isLabel ? (hz ? src.labelH : src.labelW) : 0,
        height: isLabel ? (hz ? src.labelW : src.labelH) : 0,
        dummy: true,
        padRight: 0,
        rank: r,
      });
      if (isLabel) labelDummy.set(e.id, d);
      chain.push(d);
    }
    chain.push(e.w);
    for (let k = 0; k + 1 < chain.length; k++) proper.push({ v: chain[k], w: chain[k + 1], weight: e.weight });
    chains.set(e.id, chain);
  }

  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const [id, n] of nodes) layers[n.rank].push(id);

  // 4. Crossing minimization.
  const ordered = minimizeCrossings(layers, proper, { method: opts.order, transpose: opts.transpose, sweeps: opts.sweeps }, record);
  const order = new Map<string, number>();
  ordered.layers.forEach((l) => l.forEach((n, k) => order.set(n, k)));

  // 5. Coordinates. x across the layer, y along the rank axis.
  const pinput = { layers: ordered.layers, nodes, edges: proper, nodeSep: opts.nodeSep, edgeSep: opts.edgeSep };
  const xs = opts.position === 'priority' ? priorityLayout(pinput) : brandesKopf(pinput);
  const rankSep = doubled ? opts.rankSep / 2 : opts.rankSep;
  const layerH = ordered.layers.map((l) => l.reduce((h, n) => Math.max(h, nodes.get(n)!.height), 0));
  const ys: number[] = [];
  layerH.forEach((h, r) => ys.push(r === 0 ? h / 2 : ys[r - 1] + layerH[r - 1] / 2 + rankSep + h / 2));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [id, n] of nodes) {
    const x = xs.get(id)!;
    minX = Math.min(minX, x - n.width / 2);
    maxX = Math.max(maxX, x + n.width / 2 + n.padRight);
  }
  if (!nodes.size) {
    minX = 0;
    maxX = 0;
  }
  const wTB = maxX - minX;
  const hTB = layerH.length ? ys[ys.length - 1] + layerH[layerH.length - 1] / 2 : 0;

  // 6. Back to the requested direction.
  const toFinal = (x: number, y: number): Point => {
    const X = x - minX;
    switch (dir) {
      case 'BT':
        return { x: X, y: hTB - y };
      case 'LR':
        return { x: y, y: X };
      case 'RL':
        return { x: hTB - y, y: X };
      default:
        return { x: X, y };
    }
  };
  const pos = new Map<string, Point>();
  for (const id of nodes.keys()) pos.set(id, toFinal(xs.get(id)!, ys[nodes.get(id)!.rank]));
  const bands: Band[] = ys.map((y, r) => {
    const a = y - layerH[r] / 2;
    const b = y + layerH[r] / 2;
    return dir === 'BT' || dir === 'RL' ? { lo: hTB - b, hi: hTB - a } : { lo: a, hi: b };
  });

  const routes = new Map<string, Route>();
  for (const e of loopFree) {
    const chain = chains.get(e.id)!;
    let points = chain.map((n) => pos.get(n)!);
    let ranks = chain.map((n) => nodes.get(n)!.rank);
    const reversed = flip.has(e.id);
    if (reversed) {
      points = points.reverse();
      ranks = ranks.reverse();
    }
    const ld = labelDummy.get(e.id);
    routes.set(e.id, { edge: e.id, points, ranks, labelPos: ld ? pos.get(ld)! : null, reversed });
  }

  let stage: StageRecord | null = null;
  if (record) {
    const lp = longestPath(ids, dag);
    stage = {
      direction: dir,
      nodes: [...nodes].map(([id, n]) => {
        const b = boxes.find((x) => x.id === id);
        return { id, label: b?.label ?? '', dummy: n.dummy, cluster: b?.cluster ?? false, width: n.width, height: n.height };
      }),
      edges: dag.map((e) => ({ id: e.id, v: e.v, w: e.w, reversed: flip.has(e.id) })),
      ranks: Object.fromEntries(ids.map((id) => [id, rank.get(id)!])),
      longestPathRanks: Object.fromEntries(ids.map((id) => [id, lp.get(id)!])),
      properEdges: [...chains].flatMap(([edge, chain]) => chain.slice(1).map((w, k) => ({ v: chain[k], w, edge }))),
      orders: ordered.snapshots,
      bestOrder: ordered.best,
      positions: Object.fromEntries([...pos]),
    };
  }

  const realIds = new Set(ids);
  const out = new Map([...pos].filter(([id]) => realIds.has(id)));
  return {
    width: hz ? hTB : wTB,
    height: hz ? wTB : hTB,
    pos: out,
    rank: new Map(ids.map((id) => [id, rank.get(id)!])),
    order: new Map(ids.map((id) => [id, order.get(id)!])),
    routes,
    bands,
    stats: { layers: new Set(ids.map((id) => rank.get(id)!)).size, dummies, reversed: flip.size, crossings: ordered.crossings },
    stage,
  };
}
