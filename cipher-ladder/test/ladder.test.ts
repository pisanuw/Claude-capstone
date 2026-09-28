import { describe, expect, it } from 'vitest';
import { fullStudentKey, homophonicSymbols, partialDecrypt, type StudentKey } from '../src/core/ciphers.js';
import {
  DEFAULT_LADDER,
  decodeLadder,
  encodeLadder,
  isSolved,
  ladderId,
  materialize,
  nextHint,
  normalizeLadder,
  progressFraction,
  solution,
  type LadderDef,
} from '../src/core/ladder.js';

describe('ladder', () => {
  it('materializes every default rung reproducibly', () => {
    for (let i = 0; i < DEFAULT_LADDER.rungs.length; i++) {
      const a = materialize(DEFAULT_LADDER, i);
      const b = materialize(DEFAULT_LADDER, i);
      expect(a.ciphertext).toBe(b.ciphertext);
      expect(a.key).toEqual(b.key);
      expect(a.plainLetters.length).toBeGreaterThan(300);
      expect(isSolved(a, fullStudentKey(a.key))).toBe(true);
      expect(a.title).toContain(String(i + 1));
    }
  });

  it('columnar rungs are trimmed to whole rows', () => {
    const r = materialize(DEFAULT_LADDER, 3);
    if (r.key.type !== 'columnar') throw new Error('expected columnar');
    expect(r.plainLetters.length % r.key.keyword.length).toBe(0);
    expect(r.plaintext.replace(/[^A-Za-z]/g, '').toUpperCase()).toBe(r.plainLetters);
  });

  it('uses instructor keys and plaintexts when given', () => {
    const def: LadderDef = {
      title: 'Custom',
      seed: 's',
      rungs: [{ cipher: 'caesar', key: '3', plaintext: 'The quick brown fox jumps over the lazy dog again and again', hints: 1 }],
    };
    const r = materialize(def, 0);
    expect(r.key).toEqual({ type: 'caesar', shift: 3 });
    expect(r.ciphertext.startsWith('WKHTX')).toBe(true);
    expect(r.source).toMatch(/Instructor/);
    // An unusable key falls back to a generated one.
    const bad = materialize({ ...def, rungs: [{ ...def.rungs[0], key: '99' }] }, 0);
    expect(bad.key.type).toBe('caesar');
    expect((bad.key as { shift: number }).shift).not.toBe(99);
  });

  it('encodes and decodes a ladder through the URL fragment', () => {
    const hash = encodeLadder(DEFAULT_LADDER);
    expect(hash.startsWith('l=')).toBe(true);
    expect(decodeLadder('#' + hash)).toEqual(DEFAULT_LADDER);
    expect(decodeLadder('#x=1&' + hash)).toEqual(DEFAULT_LADDER);
    expect(decodeLadder('')).toBeNull();
    expect(decodeLadder('#l=!!!')).toBeNull();
    expect(decodeLadder('#l=bm90anNvbg')).toBeNull();
    expect(ladderId(DEFAULT_LADDER)).toBe(ladderId(structuredClone(DEFAULT_LADDER)));
    expect(ladderId(DEFAULT_LADDER)).not.toBe(ladderId({ ...DEFAULT_LADDER, seed: 'x' }));
  });

  it('normalizes and rejects malformed ladders', () => {
    expect(normalizeLadder(null)).toBeNull();
    expect(normalizeLadder({})).toBeNull();
    expect(normalizeLadder({ rungs: [] })).toBeNull();
    expect(normalizeLadder({ rungs: [{ cipher: 'rot13' }] })).toBeNull();
    expect(normalizeLadder({ rungs: [null] })).toBeNull();
    const n = normalizeLadder({ rungs: [{ cipher: 'caesar', hints: 99, title: ' T ', key: ' 5 ', plaintext: 'short', note: 'n' }] });
    expect(n).toEqual({ title: 'Untitled ladder', seed: 'seed', rungs: [{ cipher: 'caesar', hints: 12, title: 'T', key: '5', note: 'n' }] });
    expect(normalizeLadder({ title: 'x', seed: 'y', rungs: [{ cipher: 'affine', hints: 'zz' }] })?.rungs[0].hints).toBe(0);
  });

  it('progressFraction rises as the key improves', () => {
    const r = materialize(DEFAULT_LADDER, 0);
    expect(progressFraction(r, { type: 'caesar', shift: null })).toBe(0);
    expect(progressFraction(r, fullStudentKey(r.key))).toBe(1);
    expect(progressFraction(r, { type: 'vigenere', keyword: 'A' })).toBe(1 - 1 + progressFraction(r, { type: 'vigenere', keyword: 'A' }));
  });

  describe('hints', () => {
    function drain(index: number, start?: StudentKey): { texts: string[]; key: StudentKey } {
      const r = materialize(DEFAULT_LADDER, index);
      let key = start ?? ({ type: r.def.cipher, ...(r.def.cipher === 'columnar' ? { order: [] } : {}) } as StudentKey);
      const texts: string[] = [];
      for (let i = 0; i < 200; i++) {
        const h = nextHint(r, key);
        if (!h) break;
        texts.push(h.text);
        key = h.key;
      }
      return { texts, key };
    }

    it('caesar: one hint reveals the shift', () => {
      const { texts, key } = drain(0);
      expect(texts).toHaveLength(1);
      expect(isSolved(materialize(DEFAULT_LADDER, 0), key)).toBe(true);
    });

    it('affine: b then a', () => {
      const { texts, key } = drain(1, { type: 'affine', a: null, b: null });
      expect(texts[0]).toMatch(/^b is/);
      expect(texts[1]).toMatch(/^a is/);
      expect(isSolved(materialize(DEFAULT_LADDER, 1), key)).toBe(true);
    });

    it('vigenere: key length then letters, skipping ones already right', () => {
      const r = materialize(DEFAULT_LADDER, 2);
      if (r.key.type !== 'vigenere') throw new Error('type');
      const { texts, key } = drain(2, { type: 'vigenere', keyword: '' });
      expect(texts[0]).toMatch(/keyword has \d+ letters/);
      expect(texts).toHaveLength(r.key.keyword.length + 1);
      expect(isSolved(r, key)).toBe(true);
      const partial = r.key.keyword[0] + '?'.repeat(r.key.keyword.length - 1);
      expect(nextHint(r, { type: 'vigenere', keyword: partial })?.text).toMatch(/letter 2 is/);
    });

    it('columnar: column count then chunk positions', () => {
      const r = materialize(DEFAULT_LADDER, 3);
      const { texts, key } = drain(3);
      expect(texts[0]).toMatch(/There are \d+ columns/);
      expect(texts[1]).toMatch(/1st chunk/);
      expect(isSolved(r, key)).toBe(true);
    });

    it('substitution: most frequent unmapped letter first, all 26 eventually', () => {
      const r = materialize(DEFAULT_LADDER, 4);
      const { texts, key } = drain(4, { type: 'substitution', map: {} });
      expect(texts).toHaveLength(26);
      expect(isSolved(r, key)).toBe(true);
    });

    it('homophonic: reveals symbols until the text is fully readable', () => {
      const r = materialize(DEFAULT_LADDER, 5);
      const { texts, key } = drain(5, { type: 'homophonic', map: {} });
      expect(texts.length).toBe(new Set(homophonicSymbols(r.ciphertext)).size);
      expect(isSolved(r, key)).toBe(true);
      expect(partialDecrypt(r.ciphertext, key)).toBe(r.plainLetters);
    });

    it('returns null when the key is already complete', () => {
      const r = materialize(DEFAULT_LADDER, 0);
      expect(nextHint(r, fullStudentKey(r.key))).toBeNull();
      expect(solution(r).text).toMatch(/^shift \d+$/);
    });
  });
});
