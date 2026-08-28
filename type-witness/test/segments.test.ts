import { describe, expect, it } from 'vitest';
import { segment } from '../src/core/segments';
import type { HoverEntry } from '../src/core/types';

const h = (start: number, end: number, type = 't'): HoverEntry => ({ start, end, type });

describe('segment', () => {
  it('covers the whole source exactly once, in order', () => {
    const code = 'const x = 1;';
    const segs = segment(code, [h(6, 7), h(10, 11)], null, []);
    expect(segs.map((s) => s.text).join('')).toBe(code);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBe(segs[i - 1].end);
    }
  });

  it('attributes a run to the smallest containing span', () => {
    const code = 'a + b';
    const segs = segment(code, [h(0, 5, 'outer'), h(0, 1, 'a'), h(4, 5, 'b')], null, []);
    const first = segs.find((s) => s.start === 0);
    const mid = segs.find((s) => s.text.includes('+'));
    const last = segs.find((s) => s.end === 5);
    expect(first?.hoverIndex).toBe(1);
    expect(mid?.hoverIndex).toBe(0);
    expect(last?.hoverIndex).toBe(2);
  });

  it('marks runs inside the current step span', () => {
    const code = 'const x = 42;';
    const segs = segment(code, [h(10, 12)], { start: 10, end: 12 }, []);
    expect(segs.filter((s) => s.current).map((s) => s.text)).toEqual(['42']);
  });

  it('marks error runs, including zero-length diagnostics', () => {
    const code = 'abc';
    const segs = segment(code, [], null, [{ start: 1, end: 1 }]);
    expect(segs.some((s) => s.error)).toBe(true);
  });

  it('clamps spans that fall outside the source', () => {
    const code = 'ab';
    const segs = segment(code, [h(-5, 99)], null, [{ start: 0, end: 50 }]);
    expect(segs.map((s) => s.text).join('')).toBe(code);
    expect(segs.every((s) => s.error)).toBe(true);
    expect(segs.every((s) => s.hoverIndex === 0)).toBe(true);
  });

  it('returns no segments for empty code', () => {
    expect(segment('', [], null, [])).toEqual([]);
  });

  it('uncovered runs have a null hover index', () => {
    const code = 'const x = 1;';
    const segs = segment(code, [h(10, 11)], null, []);
    const head = segs.find((s) => s.start === 0);
    expect(head?.hoverIndex).toBeNull();
  });
});
