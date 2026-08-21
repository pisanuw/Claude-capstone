/** RGBA bitmap, 4 bytes per pixel, row-major. Mirrors ImageData without DOM. */
export interface Bitmap {
  width: number;
  height: number;
  /** length === width * height * 4 */
  data: Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHANGE_TYPES = [
  'layout',
  'spacing',
  'color',
  'text',
  'visibility',
  'element-added',
  'element-removed',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export interface Shift {
  dx: number;
  dy: number;
  /** 0..1, how well the shifted content matches */
  score: number;
}

export interface Region {
  /** Bounding box of the changed area, in image coordinates. */
  box: Box;
  /** Number of changed (non-antialiasing) pixels inside the box. */
  changedPixels: number;
  type: ChangeType;
  /** 0..1 heuristic confidence in the label. */
  confidence: number;
  /** Plain-English evidence for the label. */
  reason: string;
  /** Present when the region's content was found displaced (layout/spacing). */
  shift?: Shift;
}

export interface DiffOptions {
  /** Per-pixel YIQ threshold, 0..1. Default 0.1 (pixelmatch's default). */
  threshold?: number;
  /** Ignore anti-aliased pixels. Default true. */
  ignoreAntialiasing?: boolean;
  /** Chebyshev distance within which changed pixels join one region. Default 8. */
  clusterGap?: number;
  /** Regions with fewer changed pixels than this are dropped as noise. Default 12. */
  minRegionPixels?: number;
  /** Maximum displacement searched when detecting moved content. Default 48. */
  maxShift?: number;
}

export interface DiffResult {
  width: number;
  height: number;
  /** Per pixel: 0 = same, 1 = changed, 2 = anti-aliasing (ignored). */
  mask: Uint8Array;
  regions: Region[];
  /** Changed pixels / total pixels, 0..1. */
  changedRatio: number;
  identical: boolean;
  /** True when the two inputs had different dimensions and were padded. */
  sizeMismatch: boolean;
}
