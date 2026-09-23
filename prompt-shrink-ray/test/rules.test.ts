import { describe, expect, it } from 'vitest';
import { FILLER_WORDS, HEDGE_WORDS, VERBOSE_PHRASES, applyPhraseRules } from '../src/core/rules.js';

describe('applyPhraseRules', () => {
  it('removes filler words and reports that a rule applied', () => {
    const { text, applied } = applyPhraseRules('Please just to clarify, do it.', FILLER_WORDS);
    expect(applied).toBe(true);
    expect(text.toLowerCase()).not.toContain('please');
    expect(text.toLowerCase()).not.toContain('just to clarify');
  });

  it('reports no change when nothing matches', () => {
    const { text, applied } = applyPhraseRules('Do it now.', FILLER_WORDS);
    expect(applied).toBe(false);
    expect(text).toBe('Do it now.');
  });

  it('rewrites verbose phrases to terser equivalents', () => {
    const { text } = applyPhraseRules('In order to finish, due to the fact that time is short.', VERBOSE_PHRASES);
    expect(text).toBe('to finish, because time is short.');
  });

  it('removes hedge phrases', () => {
    const { text, applied } = applyPhraseRules('I think this is sort of correct.', HEDGE_WORDS);
    expect(applied).toBe(true);
    expect(text.toLowerCase()).not.toContain('i think');
    expect(text.toLowerCase()).not.toContain('sort of');
  });

  it('is safe to call repeatedly on the same shared rule tables', () => {
    // Regression guard: rule regexes are module-level `g` RegExp objects: if
    // matching mutated their shared lastIndex, alternating calls on text
    // that matches would incorrectly report no match every other time.
    const first = applyPhraseRules('please help', FILLER_WORDS);
    const second = applyPhraseRules('please help', FILLER_WORDS);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
  });
});
