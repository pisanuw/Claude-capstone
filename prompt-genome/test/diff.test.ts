import { describe, expect, it } from 'vitest';
import { diffStats, diffWords, tokenizeWords } from '../src/core/diff';

describe('tokenizeWords', () => {
  it('splits on any whitespace and drops empties', () => {
    expect(tokenizeWords('  a\tb\n c ')).toEqual(['a', 'b', 'c']);
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('diffWords', () => {
  it('marks identical text as all same', () => {
    const tokens = diffWords('the same text', 'the same text');
    expect(tokens.every((t) => t.kind === 'same')).toBe(true);
  });

  it('handles two empty strings', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('marks a pure insertion', () => {
    const tokens = diffWords('write a poem', 'write a short poem');
    expect(tokens).toEqual([
      { text: 'write', kind: 'same' },
      { text: 'a', kind: 'same' },
      { text: 'short', kind: 'added' },
      { text: 'poem', kind: 'same' },
    ]);
  });

  it('marks a pure deletion', () => {
    const stats = diffStats(diffWords('write a very short poem', 'write a poem'));
    expect(stats.removed).toBe(2);
    expect(stats.added).toBe(0);
    expect(stats.same).toBe(3);
  });

  it('marks a replacement as removed plus added', () => {
    const tokens = diffWords('use must here', 'use should here');
    expect(tokens.filter((t) => t.kind === 'removed').map((t) => t.text)).toEqual(['must']);
    expect(tokens.filter((t) => t.kind === 'added').map((t) => t.text)).toEqual(['should']);
  });

  it('round-trips: same tokens reconstruct both sides', () => {
    const a = 'never include personal data in the output';
    const b = 'avoid personal data in any output you produce';
    const tokens = diffWords(a, b);
    const left = tokens.filter((t) => t.kind !== 'added').map((t) => t.text).join(' ');
    const right = tokens.filter((t) => t.kind !== 'removed').map((t) => t.text).join(' ');
    expect(left).toBe(a);
    expect(right).toBe(b);
  });

  it('falls back gracefully on very large inputs', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `w${i}`).join(' ');
    const bigChanged = `${big} tail`.replace('w1000', 'swapped');
    const tokens = diffWords(big, bigChanged);
    const left = tokens.filter((t) => t.kind !== 'added').map((t) => t.text).join(' ');
    const right = tokens.filter((t) => t.kind !== 'removed').map((t) => t.text).join(' ');
    expect(left).toBe(big);
    expect(right).toBe(bigChanged);
  });
});
