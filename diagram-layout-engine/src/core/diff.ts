// Visual diff between two versions of a flowchart. Both versions are merged
// into one union graph and laid out once, so every node keeps the same place
// in the before and after views; each element is tagged added, removed,
// changed or same.

import type { DiffStatus } from './svg';
import type { FlowEdge, FlowNode, FlowSubgraph, Flowchart } from './types';

export interface DiffEntry {
  kind: 'node' | 'edge' | 'subgraph';
  status: Exclude<DiffStatus, 'same'>;
  id: string;
  text: string;
}

export interface ChartDiff {
  union: Flowchart;
  status: Map<string, DiffStatus>;
  before: Map<string, string[]>;
  after: Map<string, string[]>;
  entries: DiffEntry[];
  counts: { added: number; removed: number; changed: number; same: number };
}

const lines = (s: string): string[] => (s ? s.split('\n') : []);
const show = (s: string): string => `'${s.replace(/\n/g, ' ')}'`;

/** Edges are matched by endpoints plus their ordinal among parallel edges. */
function edgeKeys(edges: FlowEdge[]): Map<string, FlowEdge> {
  const seen = new Map<string, number>();
  const out = new Map<string, FlowEdge>();
  for (const e of edges) {
    const base = `${e.from}\u0000${e.to}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}\u0000${n}`, e);
  }
  return out;
}

function nodeChanges(a: FlowNode, b: FlowNode): string[] {
  const out: string[] = [];
  if (a.label !== b.label) out.push(`label ${show(a.label)} -> ${show(b.label)}`);
  if (a.shape !== b.shape) out.push(`shape ${a.shape} -> ${b.shape}`);
  if ((a.parent ?? '') !== (b.parent ?? '')) out.push(`moved ${a.parent ?? 'top level'} -> ${b.parent ?? 'top level'}`);
  if (a.classes.join(',') !== b.classes.join(',')) out.push('classes');
  return out;
}

function edgeChanges(a: FlowEdge, b: FlowEdge): string[] {
  const out: string[] = [];
  if (a.label !== b.label) out.push(`label ${show(a.label)} -> ${show(b.label)}`);
  if (a.line !== b.line) out.push(`line ${a.line} -> ${b.line}`);
  if (a.head !== b.head || a.tail !== b.tail) out.push('arrowheads');
  return out;
}

function subgraphChanges(a: FlowSubgraph, b: FlowSubgraph): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push(`title ${show(a.title)} -> ${show(b.title)}`);
  if (a.direction !== b.direction) out.push(`direction ${a.direction ?? 'inherited'} -> ${b.direction ?? 'inherited'}`);
  if ((a.parent ?? '') !== (b.parent ?? '')) out.push('moved');
  return out;
}

export function diffCharts(a: Flowchart, b: Flowchart): ChartDiff {
  const status = new Map<string, DiffStatus>();
  const before = new Map<string, string[]>();
  const after = new Map<string, string[]>();
  const entries: DiffEntry[] = [];

  // Subgraphs: B wins, but never let a merged parent chain form a cycle.
  const subgraphs = new Map<string, FlowSubgraph>();
  for (const id of new Set([...a.subgraphs.keys(), ...b.subgraphs.keys()])) {
    const sa = a.subgraphs.get(id);
    const sb = b.subgraphs.get(id);
    subgraphs.set(id, { ...(sb ?? sa)!, classes: [...(sb ?? sa)!.classes], style: { ...(sb ?? sa)!.style } });
    if (sa && sb) {
      const ch = subgraphChanges(sa, sb);
      status.set(id, ch.length ? 'changed' : 'same');
      if (ch.length) entries.push({ kind: 'subgraph', status: 'changed', id, text: `subgraph ${id}: ${ch.join(', ')}` });
      before.set(id, lines(sa.title));
      after.set(id, lines(sb.title));
    } else {
      const st = sb ? 'added' : 'removed';
      status.set(id, st);
      entries.push({ kind: 'subgraph', status: st, id, text: `subgraph ${id} ${show((sb ?? sa)!.title)}` });
    }
  }
  const createsCycle = (id: string, parent: string | null): boolean => {
    let p = parent;
    while (p) {
      if (p === id) return true;
      p = subgraphs.get(p)?.parent ?? null;
    }
    return false;
  };
  for (const s of subgraphs.values()) {
    if (s.parent && (!subgraphs.has(s.parent) || createsCycle(s.id, s.parent))) s.parent = null;
  }

  // Nodes in A's order, then B's new ones, so the layout starts from A.
  const nodes = new Map<string, FlowNode>();
  const ids = [...a.nodes.keys(), ...[...b.nodes.keys()].filter((id) => !a.nodes.has(id))];
  for (const id of ids) {
    // An id that is a subgraph in either version is drawn as the subgraph.
    if (subgraphs.has(id)) continue;
    const na = a.nodes.get(id);
    const nb = b.nodes.get(id);
    const src = (nb ?? na)!;
    const node: FlowNode = { ...src, classes: [...src.classes], style: { ...src.style } };
    if (node.parent && !subgraphs.has(node.parent)) node.parent = null;
    if (na && nb) {
      const ch = nodeChanges(na, nb);
      status.set(id, ch.length ? 'changed' : 'same');
      if (ch.length) entries.push({ kind: 'node', status: 'changed', id, text: `${id}: ${ch.join(', ')}` });
      // Size the union node for the longer label so both versions fit.
      if (na.label.length > nb.label.length) node.label = na.label;
      before.set(id, lines(na.label));
      after.set(id, lines(nb.label));
    } else {
      const st = nb ? 'added' : 'removed';
      status.set(id, st);
      entries.push({ kind: 'node', status: st, id, text: `${id} ${show(src.label)}` });
    }
    nodes.set(id, node);
  }

  const ea = edgeKeys(a.edges);
  const eb = edgeKeys(b.edges);
  const edges: FlowEdge[] = [];
  let n = 0;
  const keys = [...ea.keys(), ...[...eb.keys()].filter((k) => !ea.has(k))];
  for (const k of keys) {
    const xa = ea.get(k);
    const xb = eb.get(k);
    const src = (xb ?? xa)!;
    const id = `u${n++}`;
    const edge: FlowEdge = { ...src, id, style: { ...src.style } };
    const name = `${src.from} -> ${src.to}`;
    if (xa && xb) {
      const ch = edgeChanges(xa, xb);
      status.set(id, ch.length ? 'changed' : 'same');
      if (ch.length) entries.push({ kind: 'edge', status: 'changed', id, text: `${name}: ${ch.join(', ')}` });
      if (xa.label.length > xb.label.length) edge.label = xa.label;
      before.set(id, lines(xa.label));
      after.set(id, lines(xb.label));
    } else {
      const st = xb ? 'added' : 'removed';
      status.set(id, st);
      entries.push({ kind: 'edge', status: st, id, text: `${name}${src.label ? ` ${show(src.label)}` : ''}` });
    }
    edges.push(edge);
  }

  const counts = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const s of status.values()) counts[s]++;
  const order = { removed: 0, changed: 1, added: 2 } as const;
  const kindOrder = { subgraph: 0, node: 1, edge: 2 } as const;
  entries.sort((p, q) => order[p.status] - order[q.status] || kindOrder[p.kind] - kindOrder[q.kind]);

  return {
    union: {
      direction: b.direction,
      nodes,
      edges,
      subgraphs,
      classDefs: new Map([...a.classDefs, ...b.classDefs]),
      warnings: [],
    },
    status,
    before,
    after,
    entries,
    counts,
  };
}
