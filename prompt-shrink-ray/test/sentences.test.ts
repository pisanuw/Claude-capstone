import { describe, expect, it } from 'vitest';
import { normalizeSentence, splitSentences } from '../src/core/sentences.js';

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('keeps a trailing fragment with no terminator', () => {
    expect(splitSentences('One. trailing fragment')).toEqual(['One.', 'trailing fragment']);
  });

  it('returns an empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
  });

  it('does not drop text around a terminator with no following whitespace', () => {
    // A period inside a decimal, a method call, or code is not a sentence
    // boundary; a naive split-and-discard implementation loses everything
    // before it. Every character of the input must survive somewhere.
    const text = 'Call obj.method() then check the price of 3.14 dollars.';
    const sentences = splitSentences(text);
    expect(sentences.join(' ')).toContain('obj.method()');
    expect(sentences.join(' ')).toContain('3.14 dollars');
  });

  it('never loses characters: joining sentences back reproduces every word', () => {
    const text = 'e.g. this. And also this without a trailing space.next sentence.';
    const sentences = splitSentences(text);
    const words = text.match(/[a-zA-Z0-9]+/g) ?? [];
    const rejoined = sentences.join(' ');
    for (const word of words) {
      expect(rejoined).toContain(word);
    }
  });
});

describe('normalizeSentence', () => {
  it('lowercases and strips punctuation for comparison', () => {
    expect(normalizeSentence('Respond ONLY in JSON!')).toBe('respond only in json');
  });

  it('collapses different punctuation runs to the same key', () => {
    expect(normalizeSentence('Wait...  really?')).toBe(normalizeSentence('Wait really'));
  });
});
