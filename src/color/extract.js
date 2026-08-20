// Dominant-palette extraction from a screenshot.
// Histogram quantization (5 bits per channel) on a downsampled copy, then a
// greedy pick of the most frequent buckets with a minimum perceptual distance
// between picks so the result is a usable palette, not eight shades of one sky.

import { deltaEok, toHex } from './color.js';

const SAMPLE_MAX = 144; // longest edge of the sampling canvas
const MIN_DISTANCE = 0.09; // OKLab distance between picked colors

/**
 * @param {CanvasImageSource & {width:number, height:number}} img
 * @param {number} maxColors
 * @returns {string[]} hex colors, most dominant first
 */
export function extractPalette(img, maxColors = 8) {
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, SAMPLE_MAX / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // key = 15-bit quantized color; accumulate true averages per bucket.
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent pixels
    const key =
      ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let b = buckets.get(key);
    if (!b) {
      b = { n: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, b);
    }
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
  }

  const candidates = [...buckets.values()]
    .map((b) => ({
      n: b.n,
      rgb: {
        r: Math.round(b.r / b.n),
        g: Math.round(b.g / b.n),
        b: Math.round(b.b / b.n),
      },
    }))
    .sort((a, b) => b.n - a.n);

  const picked = [];
  for (const c of candidates) {
    if (picked.length >= maxColors) break;
    if (picked.every((p) => deltaEok(p.rgb, c.rgb) >= MIN_DISTANCE)) {
      picked.push(c);
    }
  }
  // If the image is nearly monochrome the distance rule may under-fill;
  // relax it once rather than return a single swatch.
  if (picked.length < Math.min(4, candidates.length)) {
    for (const c of candidates) {
      if (picked.length >= maxColors) break;
      if (picked.every((p) => deltaEok(p.rgb, c.rgb) >= MIN_DISTANCE / 2)) {
        picked.push(c);
      }
    }
  }
  return picked.map((p) => toHex(p.rgb));
}
