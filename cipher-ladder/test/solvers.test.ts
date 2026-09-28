import { describe, expect, it } from 'vitest';
import { encrypt, keywordOrder, randomKey } from '../src/core/ciphers.js';
import { PASSAGES } from '../src/core/corpus.js';
import { makeRng } from '../src/core/rng.js';
import { accuracy, englishness, solve, solveAffine, solveCaesar, solveColumnar, solveHomophonic, solveSubstitution, solveVigenere } from '../src/core/solvers.js';
import { onlyLetters } from '../src/core/text.js';

const plain = (i: number, n?: number): string => onlyLetters(PASSAGES[i].text).slice(0, n);

describe('solvers', () => {
  it('caesar: recovers the shift and explains the frequency guess', () => {
    const r = solveCaesar(encrypt(plain(0, 200), { type: 'caesar', shift: 11 }));
    expect(r.key).toEqual({ type: 'caesar', shift: 11 });
    expect(r.plaintext).toBe(plain(0, 200));
    expect(r.confidence).toBeGreaterThan(0.8);
    expect(r.steps[0].title).toMatch(/most frequent/);
  });

  it('caesar: notes when the one-letter guess was wrong', () => {
    // A short text where the most common letter is not E.
    const text = 'ITISATRUTHTHATATALLTIMESTHATTHATWHICHISTAUGHTISNOTALWAYSTHATWHICHISLEARNT';
    const r = solveCaesar(encrypt(text, { type: 'caesar', shift: 4 }));
    expect(r.steps.some((s) => s.title.includes('wrong'))).toBe(true);
  });

  it('affine: recovers a and b', () => {
    const r = solveAffine(encrypt(plain(5, 200), { type: 'affine', a: 7, b: 3 }));
    expect(r.key).toEqual({ type: 'affine', a: 7, b: 3 });
    expect(r.plaintext).toBe(plain(5, 200));
  });

  it('vigenere: finds period and keyword', () => {
    const r = solveVigenere(encrypt(plain(2), { type: 'vigenere', keyword: 'FALCON' }));
    expect(r.key).toEqual({ type: 'vigenere', keyword: 'FALCON' });
    expect(r.plaintext).toBe(plain(2));
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.steps.map((s) => s.title)).toContain('Kasiski examination');
  });

  it('vigenere: reports when there are no repeats', () => {
    const r = solveVigenere(encrypt('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { type: 'vigenere', keyword: 'KEY' }));
    expect(r.steps[0].detail).toMatch(/No repeated trigram/);
  });

  it('columnar: enumerates read orders for a keyword of six', () => {
    const p = plain(9, 300);
    const r = solveColumnar(encrypt(p, { type: 'columnar', keyword: 'GARDEN' }));
    expect(r.key).toEqual({ type: 'columnar', order: keywordOrder('GARDEN') });
    expect(r.plaintext).toBe(p);
  });

  it('columnar: hill-climbs for eight columns', () => {
    const p = plain(7, 320);
    const r = solveColumnar(encrypt(p, { type: 'columnar', keyword: 'STRAWBERY' }));
    expect(r.key.type).toBe('columnar');
    expect(accuracy(r.plaintext, p)).toBeGreaterThan(0.9);
  });

  it('substitution: hill-climbs to the plaintext on a full passage', () => {
    const p = plain(6);
    const key = randomKey('substitution', makeRng('sub'));
    const r = solveSubstitution(encrypt(p, key));
    expect(accuracy(r.plaintext, p)).toBeGreaterThan(0.95);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('substitution: admits low confidence on a very short text', () => {
    const p = 'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG';
    const r = solveSubstitution(encrypt(p, randomKey('substitution', makeRng(2))), 2);
    expect(r.steps.some((s) => s.title === 'Low confidence')).toBe(true);
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('homophonic: reads most of a full passage', () => {
    const rng = makeRng('homophonic9');
    const key = randomKey('homophonic', rng);
    const p = plain(9);
    const r = solveHomophonic(encrypt(p, key, rng));
    expect(accuracy(r.plaintext, p)).toBeGreaterThan(0.9);
    expect(r.steps[0].title).toBe('Count the symbols');
  });

  it('homophonic: reports being stuck on a short text', () => {
    const rng = makeRng('short');
    const key = randomKey('homophonic', rng);
    const r = solveHomophonic(encrypt('ATTACKATDAWNTHEFOGWILLCOVER', key, rng), 1);
    expect(r.steps.some((s) => s.title === 'Stuck')).toBe(true);
  });

  it('solve dispatches on cipher type', () => {
    for (const type of ['caesar', 'affine', 'vigenere', 'columnar'] as const) {
      const rng = makeRng(type);
      const key = randomKey(type, rng);
      expect(solve(type, encrypt(plain(1, 240), key, rng)).cipher).toBe(type);
    }
    expect(solve('substitution', encrypt(plain(1, 60), randomKey('substitution', makeRng(1)))).cipher).toBe('substitution');
    expect(solve('homophonic', encrypt(plain(1, 60), randomKey('homophonic', makeRng(1)))).cipher).toBe('homophonic');
  });

  it('accuracy and englishness helpers', () => {
    expect(accuracy('ABC', 'ABD')).toBeCloseTo(2 / 3);
    expect(accuracy('AB', 'ABC')).toBe(0);
    expect(accuracy('', '')).toBe(0);
    expect(englishness(-12.5)).toBe(1);
    expect(englishness(-16)).toBe(0);
    expect(englishness(-14.4)).toBeCloseTo(0.5);
  });
});
