import { describe, expect, it } from 'vitest';
import { mineCount } from '../src/core/board';
import { PRESETS, boardFromRows, mulberry32, randomBoard } from '../src/core/presets';

describe('presets', () => {
  it('builds every preset with rectangular rows', () => {
    for (const p of PRESETS) {
      const b = boardFromRows(p.rows);
      expect(b.width).toBe(p.rows[0]!.length);
      expect(mineCount(b)).toBeGreaterThan(0);
    }
  });

  it('makes reproducible random boards', () => {
    expect(randomBoard(8, 8, 0.2, 5)).toEqual(randomBoard(8, 8, 0.2, 5));
    expect(randomBoard(8, 8, 0.2, 5)).not.toEqual(randomBoard(8, 8, 0.2, 6));
    const r = mulberry32(1);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
