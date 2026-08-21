import type { Bitmap } from './types';

// Perceptual per-pixel comparison in YIQ space with anti-aliasing detection.
// The algorithm follows the approach popularized by pixelmatch (Mapbox, ISC):
// colors are compared by weighted YIQ distance, and a changed pixel is
// discounted as anti-aliasing when it sits on an edge in one image and has a
// near-identical sibling among the other image's neighbors.

/** Maximum possible YIQ delta value (white vs black). */
export const MAX_YIQ_DELTA = 35215;

function channels(bmp: Bitmap, pos: number): [number, number, number] {
  const a = bmp.data[pos + 3] / 255;
  // Composite over white so transparency compares as background, not as black.
  return [
    bmp.data[pos] * a + 255 * (1 - a),
    bmp.data[pos + 1] * a + 255 * (1 - a),
    bmp.data[pos + 2] * a + 255 * (1 - a),
  ];
}

function rgb2y(r: number, g: number, b: number): number {
  return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
}
function rgb2i(r: number, g: number, b: number): number {
  return r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
}
function rgb2q(r: number, g: number, b: number): number {
  return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
}

/** Squared-weighted YIQ distance between the same pixel of two bitmaps. */
export function colorDelta(a: Bitmap, b: Bitmap, pos: number): number {
  const [r1, g1, b1] = channels(a, pos);
  const [r2, g2, b2] = channels(b, pos);
  if (r1 === r2 && g1 === g2 && b1 === b2) return 0;
  const y = rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2);
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

function lumaOf(bmp: Bitmap, x: number, y: number): number {
  const [r, g, b] = channels(bmp, (y * bmp.width + x) * 4);
  return rgb2y(r, g, b);
}

/**
 * True when (x, y) in `img` looks like an anti-aliasing artifact: it has both
 * darker and brighter neighbors, and its darkest or brightest neighbor has
 * many equal siblings in either image (i.e. sits inside a flat area).
 */
export function isAntialiased(img: Bitmap, x: number, y: number, other: Bitmap): boolean {
  const w = img.width;
  const h = img.height;
  const x0 = Math.max(0, x - 1);
  const y0 = Math.max(0, y - 1);
  const x1 = Math.min(w - 1, x + 1);
  const y1 = Math.min(h - 1, y + 1);
  const center = lumaOf(img, x, y);
  let zeroes = x === x0 || x === x1 || y === y0 || y === y1 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0, minY = 0, maxX = 0, maxY = 0;

  for (let ny = y0; ny <= y1; ny++) {
    for (let nx = x0; nx <= x1; nx++) {
      if (nx === x && ny === y) continue;
      const delta = lumaOf(img, nx, ny) - center;
      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = nx;
        minY = ny;
      } else if (delta > max) {
        max = delta;
        maxX = nx;
        maxY = ny;
      }
    }
  }
  // Not an edge: no darker or no brighter neighbor.
  if (min === 0 || max === 0) return false;
  return (
    hasManySiblings(img, minX, minY) || hasManySiblings(other, minX, minY) ||
    hasManySiblings(img, maxX, maxY) || hasManySiblings(other, maxX, maxY)
  );
}

/** True when the pixel has 3+ adjacent pixels of exactly the same luma. */
function hasManySiblings(img: Bitmap, x: number, y: number): boolean {
  const x0 = Math.max(0, x - 1);
  const y0 = Math.max(0, y - 1);
  const x1 = Math.min(img.width - 1, x + 1);
  const y1 = Math.min(img.height - 1, y + 1);
  const center = lumaOf(img, x, y);
  let zeroes = x === x0 || x === x1 || y === y0 || y === y1 ? 1 : 0;
  for (let ny = y0; ny <= y1; ny++) {
    for (let nx = x0; nx <= x1; nx++) {
      if (nx === x && ny === y) continue;
      if (center === lumaOf(img, nx, ny)) zeroes++;
      if (zeroes > 2) return true;
    }
  }
  return false;
}

export interface PixelDiff {
  /** 0 = same, 1 = changed, 2 = anti-aliasing (ignored). */
  mask: Uint8Array;
  changed: number;
  antialiased: number;
}

/**
 * Compare two same-sized bitmaps pixel by pixel.
 * `threshold` is 0..1 relative to the maximum YIQ delta (default 0.1).
 */
export function pixelDiff(a: Bitmap, b: Bitmap, threshold = 0.1, ignoreAntialiasing = true): PixelDiff {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error('pixelDiff requires same-sized bitmaps; pad them first');
  }
  const mask = new Uint8Array(a.width * a.height);
  const maxDelta = MAX_YIQ_DELTA * threshold * threshold;
  let changed = 0;
  let antialiased = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = y * a.width + x;
      const delta = colorDelta(a, b, p * 4);
      if (delta <= maxDelta) continue;
      if (ignoreAntialiasing && (isAntialiased(a, x, y, b) || isAntialiased(b, x, y, a))) {
        mask[p] = 2;
        antialiased++;
      } else {
        mask[p] = 1;
        changed++;
      }
    }
  }
  return { mask, changed, antialiased };
}
