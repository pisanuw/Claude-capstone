import type { Proc } from './interp';

export interface NodePos {
  index: number;
  x: number;
  depth: number;
}

/** Tidy layout: leaves get consecutive columns, a parent sits over the middle of its children. */
export function layoutTree(procs: Proc[]): { nodes: NodePos[]; width: number; depth: number } {
  const nodes: NodePos[] = [];
  let next = 0;
  let maxDepth = 0;
  const place = (i: number, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = (procs[i] as Proc).children;
    let x: number;
    if (!kids.length) x = next++;
    else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = ((xs[0] as number) + (xs[xs.length - 1] as number)) / 2;
    }
    nodes[i] = { index: i, x, depth };
    return x;
  };
  if (procs.length) place(0, 0);
  return { nodes, width: next, depth: maxDepth + 1 };
}
