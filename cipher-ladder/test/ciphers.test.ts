import { describe, expect, it } from 'vitest';
import {
  CIPHER_ORDER,
  columnLengths,
  describeKey,
  emptyStudentKey,
  encrypt,
  fullStudentKey,
  homophonicSymbols,
  isComplete,
  keywordOrder,
  makeHomophonicTable,
  onlyLettersOrQuery,
  parseKey,
  partialDecrypt,
  randomKey,
  type Key,
} from '../src/core/ciphers.js';
import { makeRng } from '../src/core/rng.js';
import { ALPHABET, onlyLetters } from '../src/core/text.js';

const PLAIN = 'ATTACK AT DAWN, THE FOG WILL COVER THE RIVER CROSSING';

describe('ciphers', () => {
  it('caesar shifts and unshifts', () => {
    const c = encrypt('HELLO', { type: 'caesar', shift: 3 });
    expect(c).toBe('KHOOR');
    expect(partialDecrypt(c, { type: 'caesar', shift: 3 })).toBe('HELLO');
    expect(partialDecrypt(c, { type: 'caesar', shift: null })).toBe('_____');
  });

  it('affine matches the textbook example (a=5, b=8)', () => {
    expect(encrypt('AFFINECIPHER', { type: 'affine', a: 5, b: 8 })).toBe('IHHWVCSWFRCP');
    expect(partialDecrypt('IHHWVCSWFRCP', { type: 'affine', a: 5, b: 8 })).toBe('AFFINECIPHER');
    expect(partialDecrypt('IHHW', { type: 'affine', a: null, b: 8 })).toBe('____');
    expect(partialDecrypt('IHHW', { type: 'affine', a: 2, b: 8 })).toBe('____');
  });

  it('substitution maps through a cipher alphabet and back, with unknowns', () => {
    const alphabet = 'ZYXWVUTSRQPONMLKJIHGFEDCBA';
    const c = encrypt('ABCXYZ', { type: 'substitution', alphabet });
    expect(c).toBe('ZYXCBA');
    const full = fullStudentKey({ type: 'substitution', alphabet });
    expect(partialDecrypt(c, full)).toBe('ABCXYZ');
    expect(partialDecrypt(c, { type: 'substitution', map: { Z: 'A' } })).toBe('A_____');
  });

  it('vigenere matches the Wikipedia example and supports ? placeholders', () => {
    const c = encrypt('ATTACKATDAWN', { type: 'vigenere', keyword: 'LEMON' });
    expect(c).toBe('LXFOPVEFRNHR');
    expect(partialDecrypt(c, { type: 'vigenere', keyword: 'LEMON' })).toBe('ATTACKATDAWN');
    expect(partialDecrypt(c, { type: 'vigenere', keyword: 'L?M?N' })).toBe('A_T_CK_T_AW_');
    expect(partialDecrypt(c, { type: 'vigenere', keyword: '' })).toBe('____________');
  });

  it('columnar transposition round-trips for regular and irregular grids', () => {
    expect(keywordOrder('ZEBRAS')).toEqual([4, 2, 1, 3, 5, 0]);
    expect(columnLengths(10, 4)).toEqual([3, 3, 2, 2]);
    for (const text of ['WEAREDISCOVEREDFLEEATONCE', 'ABCDEFGHIJKL']) {
      const c = encrypt(text, { type: 'columnar', keyword: 'ZEBRAS' });
      expect(c).toHaveLength(text.length);
      expect(partialDecrypt(c, { type: 'columnar', order: keywordOrder('ZEBRAS') })).toBe(text);
    }
    expect(encrypt('WEAREDISCOVEREDFLEEATONCE', { type: 'columnar', keyword: 'ZEBRAS' })).toBe('EVLNACDTESEAROFODEECWIREE');
  });

  it('columnar partial keys leave unplaced and duplicated columns blank', () => {
    const c = encrypt('ABCDEFGHIJKL', { type: 'columnar', keyword: 'BAC' }); // order [1,0,2]
    expect(partialDecrypt(c, { type: 'columnar', order: [1, null, null] })).toBe('_B__E__H__K_');
    expect(partialDecrypt(c, { type: 'columnar', order: [1, 1, 2] })).toBe('_BC_EF_HI_KL');
    expect(partialDecrypt(c, { type: 'columnar', order: [] })).toBe('____________');
  });

  it('homophonic tables use the requested symbol count and favour common letters', () => {
    const table = makeHomophonicTable(makeRng(7), 45);
    const all = Object.values(table).flat();
    expect(all).toHaveLength(45);
    expect(new Set(all).size).toBe(45);
    expect(table.E.length).toBeGreaterThan(table.Z.length);
    expect(table.Z).toHaveLength(1);
    const big = makeHomophonicTable(makeRng(7), 100);
    expect(Object.values(big).flat()).toHaveLength(100);
    expect(Object.values(makeHomophonicTable(makeRng(7), 3)).flat()).toHaveLength(26);
  });

  it('homophonic encryption varies symbols and decrypts through a symbol map', () => {
    const rng = makeRng('h');
    const key: Key = { type: 'homophonic', table: makeHomophonicTable(rng, 45) };
    const c = encrypt('EEEEEEEEEEEE', key, rng);
    const symbols = homophonicSymbols(c);
    expect(symbols).toHaveLength(12);
    expect(new Set(symbols).size).toBeGreaterThan(1);
    expect(partialDecrypt(c, fullStudentKey(key))).toBe('EEEEEEEEEEEE');
    expect(partialDecrypt(c, { type: 'homophonic', map: {} })).toBe('____________');
    // Without an rng the first symbol is used every time.
    expect(new Set(homophonicSymbols(encrypt('EEEE', key))).size).toBe(1);
  });

  it('random keys round-trip for every cipher type', () => {
    for (const type of CIPHER_ORDER) {
      const rng = makeRng(type);
      const key = randomKey(type, rng);
      expect(key.type).toBe(type);
      const c = encrypt(PLAIN, key, rng);
      expect(partialDecrypt(c, fullStudentKey(key))).toBe(onlyLetters(PLAIN));
      expect(isComplete(fullStudentKey(key))).toBe(true);
      expect(isComplete(emptyStudentKey(type))).toBe(false);
      expect(describeKey(key).length).toBeGreaterThan(3);
    }
  });

  it('random substitution alphabets never map a letter to itself', () => {
    for (let i = 0; i < 20; i++) {
      const key = randomKey('substitution', makeRng(i));
      if (key.type !== 'substitution') throw new Error('type');
      key.alphabet.split('').forEach((ch, j) => expect(ch).not.toBe(ALPHABET[j]));
    }
  });

  it('parses instructor keys and rejects bad ones', () => {
    const rng = makeRng(1);
    expect(parseKey('caesar', '7', rng)).toEqual({ type: 'caesar', shift: 7 });
    expect(parseKey('caesar', '26', rng)).toBeNull();
    expect(parseKey('caesar', 'x', rng)).toBeNull();
    expect(parseKey('affine', '5, 8', rng)).toEqual({ type: 'affine', a: 5, b: 8 });
    expect(parseKey('affine', '4,8', rng)).toBeNull();
    expect(parseKey('affine', 'nope', rng)).toBeNull();
    expect(parseKey('substitution', ALPHABET.split('').reverse().join(''), rng)).toEqual({ type: 'substitution', alphabet: 'ZYXWVUTSRQPONMLKJIHGFEDCBA' });
    expect(parseKey('substitution', 'AAAA', rng)).toBeNull();
    expect(parseKey('vigenere', 'lemon', rng)).toEqual({ type: 'vigenere', keyword: 'LEMON' });
    expect(parseKey('vigenere', 'a', rng)).toBeNull();
    expect(parseKey('columnar', 'zebra', rng)).toEqual({ type: 'columnar', keyword: 'ZEBRA' });
    expect(parseKey('homophonic', 'ignored', rng)?.type).toBe('homophonic');
    expect(parseKey('caesar', '   ', rng)?.type).toBe('caesar');
  });

  it('isComplete checks each key shape', () => {
    expect(isComplete({ type: 'affine', a: 2, b: 1 })).toBe(false);
    expect(isComplete({ type: 'vigenere', keyword: 'A?' })).toBe(false);
    expect(isComplete({ type: 'columnar', order: [0, null] })).toBe(false);
    expect(isComplete({ type: 'homophonic', map: { '01': 'A' } })).toBe(true);
    expect(onlyLettersOrQuery('a?b 1c')).toBe('A?BC');
  });
});
