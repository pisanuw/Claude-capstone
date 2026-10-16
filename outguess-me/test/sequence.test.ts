import { describe, expect, it } from 'vitest';
import {
  MAX_SEQUENCE,
  bitsToKeys,
  coinFlips,
  decodeShare,
  encodeShare,
  packBits,
  parseSequence,
  unpackBits,
} from '../src/core/sequence';
import type { Bit } from '../src/core/predictor';

describe('parseSequence', () => {
  it('parses known pairs in their natural order', () => {
    expect(parseSequence('f j, J f')).toEqual({ ok: true, bits: [0, 1, 1, 0], symbols: ['F', 'J'] });
    expect(parseSequence('1101')).toMatchObject({ bits: [1, 1, 0, 1], symbols: ['0', '1'] });
    expect(parseSequence('tthh')).toMatchObject({ bits: [1, 1, 0, 0], symbols: ['H', 'T'] });
    expect(parseSequence('RRL')).toMatchObject({ bits: [1, 1, 0] });
    expect(parseSequence('JJJ')).toMatchObject({ bits: [1, 1, 1], symbols: ['F', 'J'] });
  });

  it('maps unknown pairs by first appearance', () => {
    expect(parseSequence('xoox')).toMatchObject({ ok: true, bits: [0, 1, 1, 0], symbols: ['X', 'O'] });
    expect(parseSequence('aaa')).toMatchObject({ ok: true, bits: [0, 0, 0] });
  });

  it('rejects empty, too long and three-symbol input', () => {
    expect(parseSequence('  ').ok).toBe(false);
    expect(parseSequence('F'.repeat(MAX_SEQUENCE + 1)).ok).toBe(false);
    const r = parseSequence('abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('found 3');
    const many = parseSequence('abcdefgh');
    if (!many.ok) expect(many.error).toContain('...');
  });
});

describe('coinFlips', () => {
  it('unpacks random bytes into bits', () => {
    const fixed = (b: Uint8Array) => {
      b.fill(0b10100101);
      return b;
    };
    expect(coinFlips(10, fixed)).toEqual([1, 0, 1, 0, 0, 1, 0, 1, 1, 0]);
    const real = coinFlips(400);
    expect(real).toHaveLength(400);
    expect(new Set(real).size).toBe(2);
  });

  it('renders keys', () => {
    expect(bitsToKeys([0, 1, 1])).toBe('FJJ');
  });
});

describe('packing and share links', () => {
  it('round-trips bits of every length', () => {
    for (let n = 0; n < 40; n++) {
      const bits = Array.from({ length: n }, (_, i) => ((i * 7 + (i >> 2)) % 3 === 0 ? 1 : 0) as Bit);
      expect(unpackBits(packBits(bits), n)).toEqual(bits);
    }
  });

  it('rejects malformed packed data', () => {
    expect(unpackBits('AB', 20)).toBeNull();
    expect(unpackBits('A!', 12)).toBeNull();
    expect(unpackBits('A', -1)).toBeNull();
  });

  it('round-trips a share link', () => {
    const run = { mode: 'hard' as const, bits: [0, 1, 1, 0, 1] as Bit[], source: 'pasted' as const };
    const hash = encodeShare(run);
    expect(hash).toContain('m=hard');
    expect(decodeShare('#' + hash)).toEqual(run);
  });

  it('defaults the source and rejects bad links', () => {
    expect(decodeShare('m=easy&n=3&s=' + packBits([1, 1, 0]))).toEqual({ mode: 'easy', bits: [1, 1, 0], source: 'played' });
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('m=wild&n=3&s=A')).toBeNull();
    expect(decodeShare('m=easy&src=forged&n=3&s=A')).toBeNull();
    expect(decodeShare('m=easy&n=0&s=')).toBeNull();
    expect(decodeShare('m=easy&n=5000&s=A')).toBeNull();
    expect(decodeShare('m=easy&n=3')).toBeNull();
    expect(decodeShare('m=easy&n=30&s=A')).toBeNull();
  });
});
