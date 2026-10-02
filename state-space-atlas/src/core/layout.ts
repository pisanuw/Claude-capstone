import type { StateGraph } from './enumerate';

export type LayoutMode = 'layered' | 'radial';

export interface Layout {
  mode: LayoutMode;
  /** Normalised coordinates in [0, 1]. */
  x: Float32Array;
  y: Float32Array;
  /** Size of each distance layer (layer = distFromStart). */
  layerSizes: Int32Array;
}

/**
 * Layered layout: every node sits in the column of its distance from the
 * start, so the silhouette of the drawing is the frontier size at each depth.
 * Within a column nodes are ordered by the barycentre of their neighbours in
 * the adjacent columns (a few Sugiyama-style sweeps), which keeps edges
 * short and makes dead-end clusters visible as detached lobes.
 *
 * Radial layout uses the same ordering but maps depth to radius, so the
 * start is the centre and the frontier spreads outwards.
 */
export function computeLayout(g: StateGraph, mode: LayoutMode = 'layered', sweeps = 4): Layout {
  const n = g.keys.length;
  const depth = g.depth;
  const layerSizes = new Int32Array(depth + 1);
  for (let i = 0; i < n; i++) {
    if (g.distFromStart[i] >= 0) layerSizes[g.distFromStart[i]]++;
  }
  // Group node indices by layer in index order.
  const layerOffsets = new Int32Array(depth + 2);
  for (let l = 0; l <= depth; l++) layerOffsets[l + 1] = layerOffsets[l] + layerSizes[l];
  const order = new Int32Array(layerOffsets[depth + 1]);
  const fill = layerOffsets.slice(0, depth + 1);
  for (let i = 0; i < n; i++) {
    const l = g.distFromStart[i];
    if (l >= 0) order[fill[l]++] = i;
  }

  // rank[i] = position of node i within its layer, as a 0..1 fraction.
  const rank = new Float32Array(n);
  const assignRanks = (l: number) => {
    const from = layerOffsets[l];
    const size = layerSizes[l];
    for (let k = 0; k < size; k++) rank[order[from + k]] = size === 1 ? 0.5 : k / (size - 1);
  };
  for (let l = 0; l <= depth; l++) assignRanks(l);

  const score = new Float32Array(n);
  const sortLayer = (l: number, dir: 1 | -1) => {
    const from = layerOffsets[l];
    const size = layerSizes[l];
    if (size < 2) return;
    for (let k = 0; k < size; k++) {
      const u = order[from + k];
      let sum = 0;
      let cnt = 0;
      for (let e = g.adjStart[u]; e < g.adjStart[u + 1]; e++) {
        const v = g.adj[e];
        if (g.distFromStart[v] === l - dir) {
          sum += rank[v];
          cnt++;
        }
      }
      score[u] = cnt ? sum / cnt : rank[u];
    }
    const slice = Array.from(order.subarray(from, from + size));
    slice.sort((a, b) => score[a] - score[b] || a - b);
    order.set(slice, from);
    assignRanks(l);
  };
  for (let s = 0; s < sweeps; s++) {
    for (let l = 1; l <= depth; l++) sortLayer(l, 1);
    for (let l = depth - 1; l >= 0; l--) sortLayer(l, -1);
  }

  const x = new Float32Array(n);
  const y = new Float32Array(n);
  let widest = 1;
  for (let l = 0; l <= depth; l++) widest = Math.max(widest, layerSizes[l]);

  if (mode === 'radial') {
    const rMax = Math.max(depth, 1);
    for (let l = 0; l <= depth; l++) {
      const from = layerOffsets[l];
      const size = layerSizes[l];
      // Offset alternate layers by half a step so rings do not line up in spokes.
      const phase = (l % 2) * 0.5;
      for (let k = 0; k < size; k++) {
        const u = order[from + k];
        const theta = ((k + phase) / size) * Math.PI * 2;
        const r = (l / rMax) * 0.48;
        x[u] = 0.5 + r * Math.cos(theta);
        y[u] = 0.5 + r * Math.sin(theta);
      }
    }
  } else {
    for (let l = 0; l <= depth; l++) {
      const from = layerOffsets[l];
      const size = layerSizes[l];
      for (let k = 0; k < size; k++) {
        const u = order[from + k];
        x[u] = depth === 0 ? 0.5 : l / depth;
        // Constant spacing so the column height is proportional to the layer size.
        y[u] = 0.5 + (k - (size - 1) / 2) / Math.max(widest - 1, 1);
      }
    }
  }
  // Unreachable nodes (not possible after a BFS enumeration, but keep them visible).
  for (let i = 0; i < n; i++) {
    if (g.distFromStart[i] < 0) {
      x[i] = 1;
      y[i] = 1;
    }
  }
  return { mode, x, y, layerSizes };
}

/** Uniform grid over the layout for fast nearest-node lookups. */
export class SpatialIndex {
  private readonly cells: Int32Array[];
  private readonly size: number;

  constructor(
    private readonly layout: Layout,
    cellsPerSide = 64,
  ) {
    this.size = cellsPerSide;
    const buckets: number[][] = Array.from({ length: cellsPerSide * cellsPerSide }, () => []);
    for (let i = 0; i < layout.x.length; i++) {
      buckets[this.cellOf(layout.x[i], layout.y[i])].push(i);
    }
    this.cells = buckets.map((b) => Int32Array.from(b));
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.size - 1, Math.max(0, Math.floor(x * this.size)));
    const cy = Math.min(this.size - 1, Math.max(0, Math.floor(y * this.size)));
    return cy * this.size + cx;
  }

  /**
   * Nearest node to layout point (x, y) within `radiusPx` pixels, where sx and
   * sy are the pixels per layout unit along each axis.
   */
  nearest(x: number, y: number, radiusPx: number, sx = 1, sy = 1): number {
    const r = Math.ceil((radiusPx / Math.min(sx, sy)) * this.size) + 1;
    const cx = Math.floor(x * this.size);
    const cy = Math.floor(y * this.size);
    let best = -1;
    let bestD = radiusPx * radiusPx;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= this.size) continue;
      for (let gx = cx - r; gx <= cx + r; gx++) {
        if (gx < 0 || gx >= this.size) continue;
        const bucket = this.cells[gy * this.size + gx];
        for (let k = 0; k < bucket.length; k++) {
          const i = bucket[k];
          const dx = (this.layout.x[i] - x) * sx;
          const dy = (this.layout.y[i] - y) * sy;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }
}
