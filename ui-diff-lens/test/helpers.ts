import type { Bitmap, Box } from '../src/core/types';
import { fillRect, makeBitmap } from '../src/core/bitmap';

export const WHITE: [number, number, number, number] = [255, 255, 255, 255];
export const BLACK: [number, number, number, number] = [0, 0, 0, 255];
export const BLUE: [number, number, number, number] = [37, 99, 235, 255];
export const PURPLE: [number, number, number, number] = [147, 51, 234, 255];

/** White canvas of the given size. */
export function blank(width: number, height: number): Bitmap {
  return makeBitmap(width, height, WHITE);
}

/** Draw horizontal stripes inside a box so the content has structure. */
export function stripes(
  bmp: Bitmap,
  box: Box,
  colorA: [number, number, number, number],
  colorB: [number, number, number, number],
  bandHeight = 4,
): void {
  for (let y = 0; y < box.h; y += bandHeight) {
    const color = (y / bandHeight) % 2 === 0 ? colorA : colorB;
    fillRect(bmp, { x: box.x, y: box.y + y, w: box.w, h: Math.min(bandHeight, box.h - y) }, color);
  }
}

/** Deterministic LCG so speckle patterns are reproducible. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Fill a box with a black/white 3x3-block speckle (text-like fine detail). */
export function speckle(bmp: Bitmap, box: Box, seed: number, block = 3): void {
  const rand = lcg(seed);
  for (let y = 0; y < box.h; y += block) {
    for (let x = 0; x < box.w; x += block) {
      const color = rand() < 0.5 ? BLACK : WHITE;
      fillRect(
        bmp,
        {
          x: box.x + x,
          y: box.y + y,
          w: Math.min(block, box.w - x),
          h: Math.min(block, box.h - y),
        },
        color,
      );
    }
  }
}

/** Blend a color toward another (simulates drawing at reduced opacity). */
export function blend(
  color: [number, number, number, number],
  toward: [number, number, number],
  alpha: number,
): [number, number, number, number] {
  return [
    Math.round(toward[0] + alpha * (color[0] - toward[0])),
    Math.round(toward[1] + alpha * (color[1] - toward[1])),
    Math.round(toward[2] + alpha * (color[2] - toward[2])),
    255,
  ];
}
