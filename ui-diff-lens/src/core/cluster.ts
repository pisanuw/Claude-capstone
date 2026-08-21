import type { Box } from './types';

export interface Cluster {
  box: Box;
  /** Number of changed pixels in the cluster. */
  pixels: number;
}

/**
 * Group changed pixels (mask value 1) into regions. Two pixels belong to the
 * same region when their Chebyshev distance is <= gap. Implemented as a BFS
 * on a coarse grid of cell size `gap` so it stays linear in image size.
 */
export function clusterMask(
  mask: Uint8Array,
  width: number,
  height: number,
  gap = 8,
  minPixels = 12,
): Cluster[] {
  const cell = Math.max(1, gap);
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const counts = new Int32Array(gw * gh);
  // Track per-cell pixel bounds so boxes hug the actual pixels, not the grid.
  const minX = new Int32Array(gw * gh).fill(width);
  const minY = new Int32Array(gw * gh).fill(height);
  const maxX = new Int32Array(gw * gh).fill(-1);
  const maxY = new Int32Array(gw * gh).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;
      const g = Math.floor(y / cell) * gw + Math.floor(x / cell);
      counts[g]++;
      if (x < minX[g]) minX[g] = x;
      if (y < minY[g]) minY[g] = y;
      if (x > maxX[g]) maxX[g] = x;
      if (y > maxY[g]) maxY[g] = y;
    }
  }

  const seen = new Uint8Array(gw * gh);
  const clusters: Cluster[] = [];
  for (let start = 0; start < counts.length; start++) {
    if (counts[start] === 0 || seen[start]) continue;
    // BFS over occupied cells, connecting 8-neighborhood cells. Because a
    // cell is `gap` wide, pixels in adjacent cells are within ~2*gap; close
    // enough for visual grouping and much cheaper than per-pixel linking.
    const queue = [start];
    seen[start] = 1;
    let pixels = 0;
    let bx0 = width, by0 = height, bx1 = -1, by1 = -1;
    while (queue.length > 0) {
      const g = queue.pop() as number;
      pixels += counts[g];
      if (minX[g] < bx0) bx0 = minX[g];
      if (minY[g] < by0) by0 = minY[g];
      if (maxX[g] > bx1) bx1 = maxX[g];
      if (maxY[g] > by1) by1 = maxY[g];
      const cx = g % gw;
      const cy = Math.floor(g / gw);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (counts[n] > 0 && !seen[n]) {
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
    }
    if (pixels >= minPixels) {
      clusters.push({ box: { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 }, pixels });
    }
  }

  // Merge overlapping boxes (grid BFS can still produce overlaps at cell
  // boundaries); repeat until stable.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (boxesOverlap(clusters[i].box, clusters[j].box, gap)) {
          clusters[i] = {
            box: union(clusters[i].box, clusters[j].box),
            pixels: clusters[i].pixels + clusters[j].pixels,
          };
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  clusters.sort((a, b) => b.pixels - a.pixels);
  return clusters;
}

function boxesOverlap(a: Box, b: Box, slack: number): boolean {
  return (
    a.x - slack < b.x + b.w &&
    b.x - slack < a.x + a.w &&
    a.y - slack < b.y + b.h &&
    b.y - slack < a.y + a.h
  );
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}
