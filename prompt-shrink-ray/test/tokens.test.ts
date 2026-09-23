import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../src/core/tokens.js';

describe('estimateTokens', () => {
  it('returns all zeros for empty text', () => {
    expect(estimateTokens('')).toEqual({ characters: 0, words: 0, estimatedTokens: 0 });
  });

  it('counts characters and words', () => {
    const result = estimateTokens('one two three');
    expect(result.characters).toBe(13);
    expect(result.words).toBe(3);
  });

  it('never estimates fewer tokens than words', () => {
    // Lots of one-character "words" would under-count via chars/4 alone.
    const result = estimateTokens('a b c d e f g h');
    expect(result.estimatedTokens).toBeGreaterThanOrEqual(result.words);
  });

  it('scales roughly with character count for longer text', () => {
    const short = estimateTokens('a short prompt');
    const long = estimateTokens('a short prompt '.repeat(20));
    expect(long.estimatedTokens).toBeGreaterThan(short.estimatedTokens * 10);
  });
});
