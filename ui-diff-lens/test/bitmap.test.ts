import { describe, expect, it } from 'vitest';
import {
  backgroundFraction,
  colorDistance,
  colorStats,
  crop,
  edgeDensity,
  fillRect,
  lumaAt,
  makeBitmap,
  padTo,
  ringColor,
  sobel,
  toLuma,
} from '../src/core/bitmap';
import { blank, BLACK, WHITE } from './helpers';

describe('makeBitmap / fillRect', () => {
  it('creates a filled bitmap', () => {
    const bmp = makeBitmap(4, 3, [10, 20, 30, 255]);
    expect(bmp.data.length).toBe(4 * 3 * 4);
    expect(bmp.data[0]).toBe(10);
    expect(bmp.data[bmp.data.length - 2]).toBe(30);
  });

  it('clips rectangles to the bitmap', () => {
    const bmp = blank(10, 10);
    fillRect(bmp, { x: 8, y: 8, w: 10, h: 10 }, BLACK);
    expect(lumaAt(bmp, 9, 9)).toBe(0);
    expect(lumaAt(bmp, 7, 7)).toBeCloseTo(255, 0);
  });
});

describe('padTo', () => {
  it('returns the same object when the size already matches', () => {
    const bmp = blank(5, 5);
    expect(padTo(bmp, 5, 5)).toBe(bmp);
  });

  it('pads with transparent pixels that composite as white', () => {
    const bmp = makeBitmap(2, 2, BLACK);
    const padded = padTo(bmp, 4, 3);
    expect(padded.width).toBe(4);
    expect(padded.height).toBe(3);
    expect(lumaAt(padded, 0, 0)).toBe(0);
    expect(lumaAt(padded, 3, 2)).toBeCloseTo(255, 0);
    // alpha of the padded area is 0
    expect(padded.data[(2 * 4 + 3) * 4 + 3]).toBe(0);
  });
});

describe('crop', () => {
  it('extracts the requested box', () => {
    const bmp = blank(10, 10);
    fillRect(bmp, { x: 3, y: 3, w: 2, h: 2 }, BLACK);
    const c = crop(bmp, { x: 3, y: 3, w: 2, h: 2 });
    expect(c.width).toBe(2);
    expect(lumaAt(c, 0, 0)).toBe(0);
  });

  it('clamps out-of-range boxes', () => {
    const c = crop(blank(4, 4), { x: 2, y: 2, w: 10, h: 10 });
    expect(c.width).toBe(2);
    expect(c.height).toBe(2);
  });
});

describe('sobel / edgeDensity', () => {
  it('finds no edges on a flat image', () => {
    expect(edgeDensity(blank(20, 20))).toBe(0);
  });

  it('finds edges around a dark rectangle', () => {
    const bmp = blank(20, 20);
    fillRect(bmp, { x: 5, y: 5, w: 10, h: 10 }, BLACK);
    expect(edgeDensity(bmp)).toBeGreaterThan(0.05);
    const g = sobel(toLuma(bmp), 20, 20);
    expect(g[10 * 20 + 5]).toBeGreaterThan(0); // on the border
    expect(g[10 * 20 + 10]).toBe(0); // deep inside is flat
  });

  it('returns 0 for degenerate sizes', () => {
    expect(edgeDensity(blank(2, 2))).toBe(0);
  });
});

describe('colorStats / colorDistance', () => {
  it('measures mean and variance', () => {
    const flat = makeBitmap(4, 4, [100, 150, 200, 255]);
    const stats = colorStats(flat);
    expect(stats.mean[0]).toBeCloseTo(100, 0);
    expect(stats.variance).toBeCloseTo(0, 1);
  });

  it('handles empty bitmaps', () => {
    const stats = colorStats(makeBitmap(0, 0));
    expect(stats.mean).toEqual([255, 255, 255]);
  });

  it('computes euclidean distance', () => {
    expect(colorDistance([0, 0, 0], [255, 0, 0])).toBe(255);
  });
});

describe('ringColor / backgroundFraction', () => {
  it('picks the dominant surrounding color', () => {
    const bmp = blank(30, 30);
    fillRect(bmp, { x: 10, y: 10, w: 10, h: 10 }, BLACK);
    const bg = ringColor(bmp, { x: 10, y: 10, w: 10, h: 10 });
    expect(bg).toEqual([255, 255, 255]);
  });

  it('measures the background fraction of a crop', () => {
    const bmp = blank(10, 10);
    fillRect(bmp, { x: 0, y: 0, w: 10, h: 5 }, BLACK);
    expect(backgroundFraction(bmp, [255, 255, 255])).toBeCloseTo(0.5, 1);
    expect(backgroundFraction(makeBitmap(0, 0), WHITE.slice(0, 3) as [number, number, number])).toBe(1);
  });

  it('counts transparent pixels as background', () => {
    const bmp = makeBitmap(4, 4); // all transparent
    expect(backgroundFraction(bmp, [255, 255, 255])).toBe(1);
  });
});
