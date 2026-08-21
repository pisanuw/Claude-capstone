import type { Bitmap, Box } from './types';

export function makeBitmap(width: number, height: number, fill?: [number, number, number, number]): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

/** Fill an axis-aligned rectangle (clipped to the bitmap) with an RGBA color. */
export function fillRect(bmp: Bitmap, box: Box, rgba: [number, number, number, number]): void {
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(bmp.width, box.x + box.w);
  const y1 = Math.min(bmp.height, box.y + box.h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * bmp.width + x) * 4;
      bmp.data[i] = rgba[0];
      bmp.data[i + 1] = rgba[1];
      bmp.data[i + 2] = rgba[2];
      bmp.data[i + 3] = rgba[3];
    }
  }
}

/** Pad to the given size; new pixels are fully transparent (treated as background). */
export function padTo(bmp: Bitmap, width: number, height: number): Bitmap {
  if (bmp.width === width && bmp.height === height) return bmp;
  const out = makeBitmap(width, height);
  for (let y = 0; y < Math.min(bmp.height, height); y++) {
    const srcStart = y * bmp.width * 4;
    const copyW = Math.min(bmp.width, width);
    out.data.set(bmp.data.subarray(srcStart, srcStart + copyW * 4), y * width * 4);
  }
  return out;
}

export function crop(bmp: Bitmap, box: Box): Bitmap {
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(bmp.width, box.x + box.w);
  const y1 = Math.min(bmp.height, box.y + box.h);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const out = makeBitmap(w, h);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * bmp.width + x0) * 4;
    out.data.set(bmp.data.subarray(src, src + w * 4), y * w * 4);
  }
  return out;
}

/** Alpha-composited luma (transparent reads as white background). */
export function lumaAt(bmp: Bitmap, x: number, y: number): number {
  const i = (y * bmp.width + x) * 4;
  const a = bmp.data[i + 3] / 255;
  const r = bmp.data[i] * a + 255 * (1 - a);
  const g = bmp.data[i + 1] * a + 255 * (1 - a);
  const b = bmp.data[i + 2] * a + 255 * (1 - a);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Grayscale (luma) plane of the bitmap. */
export function toLuma(bmp: Bitmap): Float32Array {
  const out = new Float32Array(bmp.width * bmp.height);
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      out[y * bmp.width + x] = lumaAt(bmp, x, y);
    }
  }
  return out;
}

/** Sobel gradient magnitude of a luma plane. Border pixels are 0. */
export function sobel(luma: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -luma[i - width - 1] + luma[i - width + 1] -
        2 * luma[i - 1] + 2 * luma[i + 1] -
        luma[i + width - 1] + luma[i + width + 1];
      const gy =
        -luma[i - width - 1] - 2 * luma[i - width] - luma[i - width + 1] +
        luma[i + width - 1] + 2 * luma[i + width] + luma[i + width + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Fraction of pixels whose Sobel magnitude exceeds `threshold` (default 80). */
export function edgeDensity(bmp: Bitmap, threshold = 80): number {
  if (bmp.width < 3 || bmp.height < 3) return 0;
  const g = sobel(toLuma(bmp), bmp.width, bmp.height);
  let edges = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > threshold) edges++;
  return edges / g.length;
}

export interface ColorStats {
  mean: [number, number, number];
  /** Mean per-channel variance. */
  variance: number;
}

/** Mean color and variance, alpha-composited over white. */
export function colorStats(bmp: Bitmap): ColorStats {
  const n = bmp.width * bmp.height;
  if (n === 0) return { mean: [255, 255, 255], variance: 0 };
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let i = 0; i < bmp.data.length; i += 4) {
    const a = bmp.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const v = bmp.data[i + c] * a + 255 * (1 - a);
      sum[c] += v;
      sumSq[c] += v * v;
    }
  }
  const mean: [number, number, number] = [sum[0] / n, sum[1] / n, sum[2] / n];
  let variance = 0;
  for (let c = 0; c < 3; c++) variance += sumSq[c] / n - mean[c] * mean[c];
  return { mean, variance: Math.max(0, variance / 3) };
}

/** Euclidean RGB distance between two colors. */
export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Dominant border color of a box's surrounding ring: the most common quantized
 * color on a 1px ring `margin` pixels outside the box. Used as the local
 * background estimate.
 */
export function ringColor(bmp: Bitmap, box: Box, margin = 3): [number, number, number] {
  const counts = new Map<number, { n: number; rgb: [number, number, number] }>();
  const x0 = Math.max(0, box.x - margin);
  const y0 = Math.max(0, box.y - margin);
  const x1 = Math.min(bmp.width - 1, box.x + box.w - 1 + margin);
  const y1 = Math.min(bmp.height - 1, box.y + box.h - 1 + margin);
  const visit = (x: number, y: number): void => {
    const i = (y * bmp.width + x) * 4;
    const a = bmp.data[i + 3] / 255;
    const r = Math.round(bmp.data[i] * a + 255 * (1 - a));
    const g = Math.round(bmp.data[i + 1] * a + 255 * (1 - a));
    const b = Math.round(bmp.data[i + 2] * a + 255 * (1 - a));
    // Quantize to 16-level buckets so slight gradients still bucket together.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = counts.get(key);
    if (entry) {
      entry.n++;
    } else {
      counts.set(key, { n: 1, rgb: [r, g, b] });
    }
  };
  for (let x = x0; x <= x1; x++) {
    visit(x, y0);
    if (y1 !== y0) visit(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    visit(x0, y);
    if (x1 !== x0) visit(x1, y);
  }
  let best: [number, number, number] = [255, 255, 255];
  let bestN = 0;
  for (const { n, rgb } of counts.values()) {
    if (n > bestN) {
      bestN = n;
      best = rgb;
    }
  }
  return best;
}

/**
 * Fraction of pixels within `tolerance` RGB distance of `bg`
 * (alpha-composited over white; fully transparent pixels count as background).
 */
export function backgroundFraction(bmp: Bitmap, bg: [number, number, number], tolerance = 32): number {
  const n = bmp.width * bmp.height;
  if (n === 0) return 1;
  let hits = 0;
  for (let i = 0; i < bmp.data.length; i += 4) {
    const a = bmp.data[i + 3] / 255;
    if (a === 0) {
      hits++;
      continue;
    }
    const r = bmp.data[i] * a + 255 * (1 - a);
    const g = bmp.data[i + 1] * a + 255 * (1 - a);
    const b = bmp.data[i + 2] * a + 255 * (1 - a);
    if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) <= tolerance) hits++;
  }
  return hits / n;
}
