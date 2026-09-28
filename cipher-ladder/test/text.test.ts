import { describe, expect, it } from 'vitest';
import {
  AFFINE_MULTIPLIERS,
  chiSquared,
  group5,
  indexLetter,
  indexOfCoincidence,
  letterCounts,
  letterIndex,
  modInverse26,
  onlyLetters,
  reflow,
} from '../src/core/text.js';
import { PASSAGES, corpusLetters } from '../src/core/corpus.js';
import { escapeHtml } from '../src/core/html.js';

describe('text helpers', () => {
  it('keeps only upper-case letters', () => {
    expect(onlyLetters('Hello, World! 123')).toBe('HELLOWORLD');
  });

  it('groups in fives', () => {
    expect(group5('ABCDEFGHIJKL')).toBe('ABCDE FGHIJ KL');
    expect(group5('ABCDE')).toBe('ABCDE');
  });

  it('maps letters to indices and back, wrapping negatives', () => {
    expect(letterIndex('A')).toBe(0);
    expect(letterIndex('Z')).toBe(25);
    expect(indexLetter(26)).toBe('A');
    expect(indexLetter(-1)).toBe('Z');
  });

  it('counts letters', () => {
    const c = letterCounts('aab');
    expect(c[0]).toBe(2);
    expect(c[1]).toBe(1);
    expect(c.reduce((x, y) => x + y, 0)).toBe(3);
  });

  it('chi-squared is low for English and infinite for empty text', () => {
    expect(chiSquared(PASSAGES[0].text)).toBeLessThan(60);
    expect(chiSquared('ZZZZZZZZZZZZZZZZZZZZ')).toBeGreaterThan(1000);
    expect(chiSquared('')).toBe(Infinity);
  });

  it('index of coincidence is near 0.067 for English and 0 for tiny input', () => {
    const ic = indexOfCoincidence(corpusLetters());
    expect(ic).toBeGreaterThan(0.06);
    expect(ic).toBeLessThan(0.075);
    expect(indexOfCoincidence('A')).toBe(0);
  });

  it('computes modular inverses for the affine multipliers only', () => {
    for (const a of AFFINE_MULTIPLIERS) expect((a * modInverse26(a)) % 26).toBe(1);
    expect(modInverse26(2)).toBe(-1);
    expect(modInverse26(13)).toBe(-1);
  });

  it('reflows letters into a template and stops when letters run out', () => {
    expect(reflow('HELLOWORLD', 'Xxxxx, xxxxx!')).toBe('HELLO, WORLD!');
    expect(reflow('HEL', 'Xxxxx, xxxxx!')).toBe('HEL');
  });

  it('escapes html', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('every passage is long enough to be a puzzle', () => {
    for (const p of PASSAGES) expect(onlyLetters(p.text).length).toBeGreaterThan(400);
    expect(PASSAGES.length).toBeGreaterThanOrEqual(12);
  });
});
