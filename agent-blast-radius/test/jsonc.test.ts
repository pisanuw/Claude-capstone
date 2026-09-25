import { describe, expect, it } from 'vitest';
import { asStringArray, asStringRecord, isRecord, parseJsonc, stripJsonc } from '../src/core/jsonc.js';

describe('parseJsonc', () => {
  it('parses plain JSON', () => {
    expect(parseJsonc('{"a": [1, 2]}')).toEqual({ a: [1, 2] });
  });

  it('strips line and block comments and trailing commas', () => {
    const text = `{
      // a comment
      "a": 1, /* block */
      "b": [1, 2,],
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: [1, 2] });
  });

  it('leaves comment-like text and commas inside strings alone', () => {
    expect(parseJsonc('{"url": "https://x.dev/a,}", "q": "say \\"hi\\" // no"}')).toEqual({ url: 'https://x.dev/a,}', q: 'say "hi" // no' });
  });

  it('drops a byte-order mark and an unterminated block comment', () => {
    expect(parseJsonc('\uFEFF{"a": 1}')).toEqual({ a: 1 });
    expect(stripJsonc('{"a": 1} /* open')).toBe('{"a": 1} ');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJsonc('{nope')).toThrow();
  });
});

describe('type helpers', () => {
  it('isRecord accepts only plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  it('asStringArray keeps strings only', () => {
    expect(asStringArray(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(asStringArray('a')).toEqual([]);
  });

  it('asStringRecord stringifies scalars and drops objects', () => {
    expect(asStringRecord({ a: 'x', b: 2, c: true, d: { e: 1 } })).toEqual({ a: 'x', b: '2', c: 'true' });
    expect(asStringRecord(null)).toEqual({});
  });
});
