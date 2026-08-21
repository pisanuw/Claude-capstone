import type { Bitmap, Box, Region, Shift } from './types';
import {
  backgroundFraction,
  colorDistance,
  colorStats,
  crop,
  edgeDensity,
  ringColor,
  sobel,
  toLuma,
} from './bitmap';
import type { Cluster } from './cluster';

// Heuristic classification of a changed region. The checks run in order of
// decreasing reliability; the first one that fires names the region:
//
//   1. element-added / element-removed  (one side is just background)
//   2. layout / spacing                 (the same content found displaced)
//   3. visibility                       (one side is a faded blend of the other)
//   4. color                            (same structure, different colors)
//   5. text                             (both sides text-like, structure changed)
//   6. layout                           (fallback: structure changed in place)

const BG_SIDE_EMPTY = 0.95;
const BG_SIDE_CONTENT = 0.85;
const SHIFT_MATCH_MAX_MAD = 10;
const SHIFT_IMPROVEMENT = 8;
const SPACING_MAX = 12;
const EDGE_CORR_COLOR = 0.8;
const TEXT_EDGE_DENSITY = 0.05;

export interface ClassifyContext {
  a: Bitmap;
  b: Bitmap;
  lumaA: Float32Array;
  lumaB: Float32Array;
  maxShift: number;
}

function pad(box: Box, margin: number, width: number, height: number): Box {
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  return {
    x,
    y,
    w: Math.min(width, box.x + box.w + margin) - x,
    h: Math.min(height, box.y + box.h + margin) - y,
  };
}

/**
 * Search for the region's content (template from image A) displaced in image
 * B. Returns the best offset when it matches clearly better than staying put.
 */
export function findShift(ctx: ClassifyContext, box: Box): Shift | null {
  const { lumaA, lumaB, a, b, maxShift } = ctx;
  const w = a.width;
  const h = a.height;
  // Sample the template on a stride so large regions stay cheap.
  const stride = Math.max(1, Math.floor(Math.sqrt((box.w * box.h) / 1024)));
  const xs: number[] = [];
  const ys: number[] = [];
  const vals: number[] = [];
  let sum = 0;
  let sumSq = 0;
  for (let y = box.y; y < box.y + box.h; y += stride) {
    for (let x = box.x; x < box.x + box.w; x += stride) {
      if (x >= w || y >= h) continue;
      const v = lumaA[y * w + x];
      xs.push(x);
      ys.push(y);
      vals.push(v);
      sum += v;
      sumSq += v * v;
    }
  }
  const n = vals.length;
  if (n < 16) return null;
  // A flat template matches anywhere; displacement would be meaningless.
  const variance = sumSq / n - (sum / n) ** 2;
  if (variance < 100) return null;

  const mad = (dx: number, dy: number): number => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i] + dx;
      const y = ys[i] + dy;
      // Any clipped sample invalidates the offset: a partial window could
      // drop exactly the distinctive pixels and "match" flat background.
      if (x < 0 || y < 0 || x >= b.width || y >= b.height) return Infinity;
      total += Math.abs(vals[i] - lumaB[y * b.width + x]);
    }
    return total / n;
  };

  const zero = mad(0, 0);
  let bestDx = 0;
  let bestDy = 0;
  let best = zero;
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      if (dx === 0 && dy === 0) continue;
      const m = mad(dx, dy);
      if (m < best) {
        best = m;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  if (best > SHIFT_MATCH_MAX_MAD) return null;
  if (zero - best < SHIFT_IMPROVEMENT) return null;
  return { dx: bestDx, dy: bestDy, score: 1 - best / 255 };
}

/**
 * Least-squares opacity fit: how well does `to` match `bg + alpha * (from - bg)`?
 * Returns the alpha and the relative residual of the fit.
 */
export function fitOpacity(
  from: Bitmap,
  to: Bitmap,
  bg: [number, number, number],
): { alpha: number; residual: number } | null {
  if (from.width !== to.width || from.height !== to.height) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < from.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const af = from.data[i + 3] / 255;
      const at = to.data[i + 3] / 255;
      const f = from.data[i + c] * af + 255 * (1 - af) - bg[c];
      const t = to.data[i + c] * at + 255 * (1 - at) - bg[c];
      num += f * t;
      den += f * f;
    }
  }
  if (den < 1e4) return null; // `from` is essentially flat background
  const alpha = num / den;
  let resSq = 0;
  for (let i = 0; i < from.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const af = from.data[i + 3] / 255;
      const at = to.data[i + 3] / 255;
      const f = from.data[i + c] * af + 255 * (1 - af) - bg[c];
      const t = to.data[i + c] * at + 255 * (1 - at) - bg[c];
      const e = t - alpha * f;
      resSq += e * e;
    }
  }
  return { alpha, residual: Math.sqrt(resSq / den) };
}

/** Pearson correlation of two same-length arrays. */
export function correlation(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  if (n === 0 || n !== b.length) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va < 1e-6 || vb < 1e-6) return 0;
  return cov / Math.sqrt(va * vb);
}

export function classifyRegion(ctx: ClassifyContext, cluster: Cluster): Region {
  const { a, b } = ctx;
  const box = cluster.box;
  const work = pad(box, 4, a.width, a.height);
  const cropA = crop(a, work);
  const cropB = crop(b, work);
  const bgA = ringColor(a, work);
  const bgB = ringColor(b, work);
  const bgFracA = backgroundFraction(cropA, bgA);
  const bgFracB = backgroundFraction(cropB, bgB);

  const base = { box, changedPixels: cluster.pixels };
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  // 1. Added / removed: one side is essentially local background.
  if (bgFracA >= BG_SIDE_EMPTY && bgFracB < BG_SIDE_CONTENT) {
    return {
      ...base,
      type: 'element-added',
      confidence: Math.min(0.98, bgFracA),
      reason:
        `Before: this area is ${pct(bgFracA)} background. After: new content covers ` +
        `${pct(1 - bgFracB)} of it. An element was added here.`,
    };
  }
  if (bgFracB >= BG_SIDE_EMPTY && bgFracA < BG_SIDE_CONTENT) {
    return {
      ...base,
      type: 'element-removed',
      confidence: Math.min(0.98, bgFracB),
      reason:
        `Before: content covers ${pct(1 - bgFracA)} of this area. After: it is ` +
        `${pct(bgFracB)} background. An element was removed here.`,
    };
  }

  // 2. Displacement: the same content found at an offset.
  const shift = findShift(ctx, box);
  if (shift) {
    const axisAligned = shift.dx === 0 || shift.dy === 0;
    const magnitude = Math.max(Math.abs(shift.dx), Math.abs(shift.dy));
    const moved = `moved ${shift.dx >= 0 ? shift.dx : shift.dx}px right, ${shift.dy}px down`
      .replace('moved -', 'moved -')
      .replace(' 0px right,', '')
      .replace(', 0px down', '');
    if (axisAligned && magnitude <= SPACING_MAX) {
      return {
        ...base,
        type: 'spacing',
        confidence: shift.score,
        reason:
          `The same content reappears ${moved.trim()} (match ${pct(shift.score)}). ` +
          `A small single-axis offset like this is a margin or padding change.`,
        shift,
      };
    }
    return {
      ...base,
      type: 'layout',
      confidence: shift.score,
      reason: `The same content reappears ${moved.trim()} (match ${pct(shift.score)}), so this block was repositioned.`,
      shift,
    };
  }

  // 3. Visibility: one side is a faded (alpha-blended) version of the other.
  const fadeOut = fitOpacity(cropA, cropB, bgA);
  if (fadeOut && fadeOut.alpha >= 0.03 && fadeOut.alpha <= 0.9 && fadeOut.residual < 0.25) {
    return {
      ...base,
      type: 'visibility',
      confidence: 1 - fadeOut.residual,
      reason:
        `After matches the before content blended toward the background at ` +
        `${Math.round(fadeOut.alpha * 100)}% opacity, so this element faded out or was dimmed.`,
    };
  }
  const fadeIn = fitOpacity(cropB, cropA, bgB);
  if (fadeIn && fadeIn.alpha >= 0.03 && fadeIn.alpha <= 0.9 && fadeIn.residual < 0.25) {
    return {
      ...base,
      type: 'visibility',
      confidence: 1 - fadeIn.residual,
      reason:
        `Before matches the after content blended toward the background at ` +
        `${Math.round(fadeIn.alpha * 100)}% opacity, so this element became more visible.`,
    };
  }

  // 4. Color: structure (edges) unchanged, palette shifted.
  const edgesA = sobel(toLuma(cropA), cropA.width, cropA.height);
  const edgesB = sobel(toLuma(cropB), cropB.width, cropB.height);
  const structureCorr = correlation(edgesA, edgesB);
  const statsA = colorStats(cropA);
  const statsB = colorStats(cropB);
  const meanShift = colorDistance(statsA.mean, statsB.mean);
  if (structureCorr >= EDGE_CORR_COLOR) {
    return {
      ...base,
      type: 'color',
      confidence: structureCorr,
      reason:
        `The edge structure is ${pct(structureCorr)} identical between the two shots, but the ` +
        `average color moved by ${Math.round(meanShift)} RGB units: a restyle, not a re-layout.`,
    };
  }

  // 5. Text: both sides are dense fine detail and neither is background.
  const densityA = edgeDensity(cropA);
  const densityB = edgeDensity(cropB);
  if (densityA >= TEXT_EDGE_DENSITY && densityB >= TEXT_EDGE_DENSITY) {
    return {
      ...base,
      type: 'text',
      confidence: Math.min(densityA, densityB) >= TEXT_EDGE_DENSITY * 2 ? 0.8 : 0.6,
      reason:
        `Both sides contain fine-grained detail (edge density ${pct(densityA)} vs ${pct(densityB)}) ` +
        `whose structure differs in place and was not found displaced: consistent with edited text.`,
    };
  }

  // 6. Fallback: content changed in place, structure differs.
  return {
    ...base,
    type: 'layout',
    confidence: 0.4,
    reason:
      `Content changed in place: structure similarity is only ${pct(Math.max(0, structureCorr))} and no ` +
      `displaced match, fade, or restyle explains it. Labeled as a layout change.`,
  };
}
