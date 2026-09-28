import { describe, expect, it } from 'vitest';
import { ENGLISH_ORDER, column, frequencyOrder, icByPeriod, kasiski, letterFrequencies, symbolFrequencies, topNgrams } from '../src/core/analysis.js';
import { encrypt } from '../src/core/ciphers.js';
import { PASSAGES } from '../src/core/corpus.js';
import { buildModel, englishModel } from '../src/core/ngram.js';
import { hashString, makeRng } from '../src/core/rng.js';

describe('analysis tools', () => {
  it('letter frequencies sum to 100 percent and carry the English baseline', () => {
    const rows = letterFrequencies('HELLO');
    expect(rows).toHaveLength(26);
    expect(rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 6);
    expect(rows.find((r) => r.letter === 'L')?.count).toBe(2);
    expect(rows.find((r) => r.letter === 'E')?.english).toBeCloseTo(12.702);
  });

  it('orders letters by frequency with alphabetical ties', () => {
    expect(frequencyOrder('BBAAC').slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(ENGLISH_ORDER.slice(0, 3)).toEqual(['E', 'T', 'A']);
  });

  it('finds the top n-grams', () => {
    const bi = topNgrams('THE THE THEN', 2, 3);
    expect(bi[0]).toEqual({ gram: 'HE', count: 3 });
    expect(bi[1]).toEqual({ gram: 'TH', count: 3 });
    expect(topNgrams('ABCABC', 3, 5)[0]).toEqual({ gram: 'ABC', count: 2 });
  });

  it('counts homophonic symbols', () => {
    expect(symbolFrequencies('01 02 01 xx 03')).toEqual([
      { gram: '01', count: 2 },
      { gram: '02', count: 1 },
      { gram: '03', count: 1 },
    ]);
  });

  it('extracts columns', () => {
    expect(column('ABCDEFG', 3, 0)).toBe('ADG');
    expect(column('ABCDEFG', 3, 2)).toBe('CF');
  });

  it('IC by period peaks at the Vigenere key length', () => {
    const cipher = encrypt(PASSAGES[2].text, { type: 'vigenere', keyword: 'PLANET' });
    const rows = icByPeriod(cipher, 10);
    const best = rows.slice().sort((a, b) => b.ic - a.ic)[0];
    expect(best.period).toBe(6);
    expect(rows[0].ic).toBeLessThan(0.05);
  });

  it('Kasiski distances are divisible by the key length', () => {
    const cipher = encrypt(PASSAGES[4].text, { type: 'vigenere', keyword: 'LEMON' });
    const k = kasiski(cipher, 3, 10);
    expect(k.repeats.length).toBeGreaterThan(0);
    const five = k.factorCounts.find((f) => f.period === 5)!;
    const seven = k.factorCounts.find((f) => f.period === 7)!;
    expect(five.count).toBeGreaterThan(seven.count);
    expect(kasiski('ABCDEFG').repeats).toEqual([]);
  });
});

describe('language model', () => {
  it('scores English above shuffled English above random letters', () => {
    const m = englishModel();
    expect(englishModel()).toBe(m);
    const english = m.scorePerLetter(PASSAGES[3].text);
    const shuffled = m.scorePerLetter(makeRng(3).shuffle(PASSAGES[3].text.replace(/[^A-Za-z]/g, '').split('')).join(''));
    const random = m.scorePerLetter('QZXKJVBWPFGMYUCLDRHSNIOATEQZXKJVBWPFGMYUCLDRHSNIOATE');
    expect(english).toBeGreaterThan(shuffled);
    expect(shuffled).toBeGreaterThan(random);
    expect(m.scorePerLetter('')).toBe(-Infinity);
  });

  it('builds a model from any letters', () => {
    const m = buildModel('THETHETHE');
    expect(m.score('THE')).toBeGreaterThan(m.score('XQZ'));
  });
});

describe('rng', () => {
  it('is deterministic for the same seed and different across seeds', () => {
    const a = makeRng('seed');
    const b = makeRng('seed');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(makeRng('seed').next()).not.toBe(makeRng('other').next());
    expect(makeRng(0).next()).toBe(makeRng(1).next());
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('shuffles without losing elements and picks within range', () => {
    const r = makeRng(42);
    const s = r.shuffle([1, 2, 3, 4, 5]);
    expect(s.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    for (let i = 0; i < 50; i++) expect(r.int(3)).toBeLessThan(3);
    expect([1, 2, 3]).toContain(r.pick([1, 2, 3]));
  });
});
