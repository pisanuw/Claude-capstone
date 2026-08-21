import { describe, expect, it } from 'vitest';
import { clusterMask } from '../src/core/cluster';

function maskWith(width: number, height: number, boxes: Array<[number, number, number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x0, y0, w, h] of boxes) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}

describe('clusterMask', () => {
  it('finds a single tight cluster', () => {
    const mask = maskWith(100, 100, [[10, 12, 8, 6]]);
    const clusters = clusterMask(mask, 100, 100);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].box).toEqual({ x: 10, y: 12, w: 8, h: 6 });
    expect(clusters[0].pixels).toBe(48);
  });

  it('keeps far-apart blobs separate but merges near ones', () => {
    const far = clusterMask(maskWith(200, 200, [[10, 10, 10, 10], [100, 100, 10, 10]]), 200, 200);
    expect(far).toHaveLength(2);

    const near = clusterMask(maskWith(200, 200, [[10, 10, 10, 10], [24, 10, 10, 10]]), 200, 200, 8);
    expect(near).toHaveLength(1);
    expect(near[0].box.w).toBeGreaterThanOrEqual(24);
  });

  it('drops noise below the minimum pixel count', () => {
    const clusters = clusterMask(maskWith(50, 50, [[5, 5, 2, 2]]), 50, 50, 8, 12);
    expect(clusters).toHaveLength(0);
  });

  it('ignores anti-aliasing pixels (mask value 2)', () => {
    const mask = new Uint8Array(50 * 50);
    for (let i = 0; i < 100; i++) mask[i] = 2;
    expect(clusterMask(mask, 50, 50)).toHaveLength(0);
  });

  it('sorts clusters by size, largest first', () => {
    const clusters = clusterMask(
      maskWith(300, 300, [[10, 10, 5, 5], [200, 200, 20, 20]]),
      300,
      300,
    );
    expect(clusters[0].pixels).toBe(400);
    expect(clusters[1].pixels).toBe(25);
  });
});
