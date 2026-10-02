import { describe, expect, it } from 'vitest';
import { createBoard } from '../src/core/board';
import { randomBoard } from '../src/core/presets';
import { decodeBoard, encodeBoard, fromBase64Url, hashFor, parseHash, toBase64Url } from '../src/core/share';

describe('share links', () => {
  it('round-trips boards of every size', () => {
    for (const [w, h, seed] of [
      [4, 4, 1],
      [5, 7, 2],
      [16, 14, 3],
      [40, 40, 4],
    ] as const) {
      const b = randomBoard(w, h, 0.3, seed);
      b.start = 3;
      expect(decodeBoard(encodeBoard(b))).toEqual(b);
    }
  });

  it('keeps links short', () => {
    expect(encodeBoard(createBoard(40, 40)).length).toBeLessThan(290);
  });

  it('round-trips base64url for every padding length', () => {
    for (let n = 0; n < 7; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
    expect(toBase64Url(Uint8Array.from([251, 255]))).toBe('-_8');
  });

  it('rejects malformed codes with a reason', () => {
    const good = encodeBoard(createBoard(4, 4));
    expect(() => decodeBoard('nope')).toThrow(/Not a Reverse/);
    expect(() => decodeBoard(good.replace('4x4', '4by4'))).toThrow(/size is malformed/);
    expect(() => decodeBoard(good.replace('4x4', '2x4'))).toThrow(/out of range/);
    expect(() => decodeBoard(good.replace('.-1.', '.x.'))).toThrow(/Start cell is malformed/);
    expect(() => decodeBoard(good.replace('.-1.', '.16.'))).toThrow(/off the board/);
    expect(() => decodeBoard(good + 'AAAA')).toThrow(/wrong length/);
    expect(() => decodeBoard('v1.4x4.0.A!A')).toThrow(/base64url/);
  });

  it('parses edit and play routes from the fragment', () => {
    const b = randomBoard(6, 5, 0.2, 9);
    b.start = 2;
    expect(parseHash(hashFor('play', b))).toEqual({ mode: 'play', board: b });
    expect(parseHash(hashFor('edit', b).slice(1))!.mode).toBe('edit');
    expect(parseHash('')).toBeNull();
    expect(parseHash('#about')).toBeNull();
  });
});
