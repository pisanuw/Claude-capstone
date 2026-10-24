import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/cache';
import { decodeState, encodeState } from '../src/core/share';
import { parseValues, sweep } from '../src/core/sweep';
import { buildTrace } from '../src/core/trace';
import { elementsInLine, gridShape, hex, lineLabel, percent } from '../src/core/view';

describe('share links', () => {
  it('round-trips both kernels and the cache', () => {
    const cfg = { ...DEFAULT_CONFIG, size: 2048, ways: 4, policy: 'fifo' as const, writeAllocate: false, writeBack: false, seed: 9 };
    const s = { a: 'double A[4]; // ü', b: 'int B[2];', cfg };
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState(encodeState({ ...s, b: '' }))?.b).toBe('');
  });

  it('falls back on bad input', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#a=%%%')).toBeNull();
    expect(decodeState('#a=YQ&c=1000-24-2-lru-wa-wb-1')?.cfg).toEqual(DEFAULT_CONFIG);
    expect(decodeState('#a=YQ&c=1024-32-2-weird-wa-wb-x')?.cfg).toEqual({ ...DEFAULT_CONFIG, policy: 'lru', seed: 1 });
  });
});

describe('sweep', () => {
  const src = '#define N 64\n#define S 1\nint A[N];\nint s = 0;\nfor (int i = 0; i < N; i += S) s += A[i];';

  it('parses value lists', () => {
    expect(parseValues('1, 2 4,,8')).toEqual([1, 2, 4, 8]);
    expect(() => parseValues('a')).toThrow(/not a number/);
    expect(() => parseValues(' ')).toThrow(/at least one/);
    expect(() => parseValues(Array(41).fill(1).join(','))).toThrow(/at most 40/);
  });

  it('varies a constant', () => {
    const pts = sweep(src, { ...DEFAULT_CONFIG, lineSize: 32 }, { kind: 'const', name: 'S' }, [1, 8, 0]);
    expect(pts[0]).toMatchObject({ x: 1, misses: 8, accesses: 64 });
    expect(pts[1]).toMatchObject({ x: 8, misses: 8, accesses: 8, missRate: 1 });
    expect(pts[2]?.missRate).toBeNull();
    expect(pts[2]?.error).toMatch(/memory accesses/);
  }, 20000);

  it('varies cache parameters and reports invalid ones', () => {
    const pts = sweep(src, DEFAULT_CONFIG, { kind: 'lineSize' }, [16, 64, 3]);
    expect(pts.map((p) => p.misses)).toEqual([16, 4, null]);
    expect(sweep(src, DEFAULT_CONFIG, { kind: 'size' }, [64])[0]?.misses).toBe(8);
    expect(sweep(src, DEFAULT_CONFIG, { kind: 'ways' }, [1, 32])[1]?.misses).toBe(8);
  });
});

describe('view helpers', () => {
  const t = buildTrace('double A[4][8]; char c[3];');
  const [A, c] = t.arrays;

  it('finds the elements in a line', () => {
    expect(elementsInLine(A!, A!.base / 32, 32)).toEqual([0, 3]);
    expect(elementsInLine(A!, A!.base / 32 + 100, 32)).toBeNull();
    expect(elementsInLine(c!, c!.base / 64, 64)).toEqual([0, 2]);
  });

  it('labels lines', () => {
    expect(lineLabel(t, A!.base / 32 + 1, 32)).toBe('A[0][4..7]');
    expect(lineLabel(t, A!.base / 64 + 1, 64)).toBe('A[1][0..7]');
    expect(lineLabel(t, A!.base / 128, 128)).toBe('A[0][0]..A[1][7]');
    expect(lineLabel(t, c!.base / 4, 4)).toBe('c[0..2]');
    expect(lineLabel(buildTrace('char x[1];'), 0x10000 / 4, 4)).toBe('x[0]');
    expect(lineLabel(t, 0, 32)).toBe('line 0x0');
    const both = buildTrace('char a[2] @ 0; char b[2] @ 2;');
    expect(lineLabel(both, 0, 4)).toBe('a[0..1] + b[0..1]');
  });

  it('shapes arrays for drawing', () => {
    expect(gridShape(A!, 32)).toEqual({ rows: 4, cols: 8 });
    expect(gridShape(buildTrace('int z[1000];').arrays[0]!, 32)).toEqual({ rows: 21, cols: 48 });
    expect(gridShape(buildTrace('int z[5];').arrays[0]!, 32)).toEqual({ rows: 1, cols: 5 });
  });

  it('formats numbers', () => {
    expect(hex(255)).toBe('0xff');
    expect(percent(0.25)).toBe('25.0%');
    expect(percent(0.00012)).toBe('0.01%');
  });
});
