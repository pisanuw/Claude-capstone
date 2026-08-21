import type { Bitmap, DiffOptions, DiffResult } from './types';
import { padTo, toLuma } from './bitmap';
import { pixelDiff } from './pixelDiff';
import { clusterMask } from './cluster';
import { classifyRegion, type ClassifyContext } from './classify';

export const DEFAULT_OPTIONS: Required<DiffOptions> = {
  threshold: 0.1,
  ignoreAntialiasing: true,
  clusterGap: 8,
  minRegionPixels: 12,
  maxShift: 48,
};

/** Regions beyond this count are classified as plain 'layout' without the
 * expensive displacement search, so pathological inputs stay responsive. */
const MAX_CLASSIFIED_REGIONS = 64;

export function analyze(imgA: Bitmap, imgB: Bitmap, options: DiffOptions = {}): DiffResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const width = Math.max(imgA.width, imgB.width);
  const height = Math.max(imgA.height, imgB.height);
  const sizeMismatch = imgA.width !== imgB.width || imgA.height !== imgB.height;
  const a = padTo(imgA, width, height);
  const b = padTo(imgB, width, height);

  const { mask, changed } = pixelDiff(a, b, opts.threshold, opts.ignoreAntialiasing);
  const clusters = clusterMask(mask, width, height, opts.clusterGap, opts.minRegionPixels);

  const ctx: ClassifyContext = {
    a,
    b,
    lumaA: toLuma(a),
    lumaB: toLuma(b),
    maxShift: opts.maxShift,
  };

  const regions = clusters.map((cluster, i) => {
    if (i >= MAX_CLASSIFIED_REGIONS) {
      return {
        box: cluster.box,
        changedPixels: cluster.pixels,
        type: 'layout' as const,
        confidence: 0.3,
        reason: `Region ${i + 1} exceeds the per-image classification budget of ${MAX_CLASSIFIED_REGIONS}; left as a generic change.`,
      };
    }
    return classifyRegion(ctx, cluster);
  });

  return {
    width,
    height,
    mask,
    regions,
    changedRatio: changed / (width * height),
    identical: changed === 0,
    sizeMismatch,
  };
}
