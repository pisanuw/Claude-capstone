import { describe, it, expect } from 'vitest';
import {
  englishToEmoji,
  emojiToEnglish,
  translate,
  splitEmoji,
  looksLikeEmoji,
} from '../src/translate.js';

describe('looksLikeEmoji', () => {
  it('detects emoji and plain text', () => {
    expect(looksLikeEmoji('🐱')).toBe(true);
    expect(looksLikeEmoji('hello 🐱')).toBe(true);
    expect(looksLikeEmoji('hello')).toBe(false);
    expect(looksLikeEmoji('')).toBe(false);
  });
});

describe('splitEmoji', () => {
  it('splits a run of emoji into graphemes', () => {
    expect(splitEmoji('🐱🍕')).toEqual(['🐱', '🍕']);
  });
  it('keeps multi-codepoint emoji intact', () => {
    const parts = splitEmoji('👨‍👩‍👧');
    expect(parts).toHaveLength(1);
  });
  it('ignores whitespace', () => {
    expect(splitEmoji(' 🐱  🍕 ')).toEqual(['🐱', '🍕']);
  });
});

describe('englishToEmoji', () => {
  it('replaces known words with emoji', () => {
    const r = englishToEmoji('cat');
    expect(r.output).toBe('🐱');
    expect(r.engine).toBe('dictionary');
  });

  it('is case-insensitive', () => {
    expect(englishToEmoji('CAT').output).toBe('🐱');
  });

  it('handles simple plurals and -ing/-ed forms', () => {
    expect(englishToEmoji('dogs').output).toBe('🐶');
    expect(englishToEmoji('running').output).toBe('🏃');
    expect(englishToEmoji('loved').output).toBe('❤️');
  });

  it('preserves unknown words and reports them', () => {
    const r = englishToEmoji('the quixotic cat');
    expect(r.output).toContain('🐱');
    expect(r.output).toContain('quixotic');
    expect(r.untranslated).toContain('quixotic');
  });

  it('preserves trailing punctuation', () => {
    expect(englishToEmoji('cat,').output).toBe('🐱,');
  });

  it('matches multi-word phrases before single words', () => {
    expect(englishToEmoji('ice cream').output).toBe('🍦');
    expect(englishToEmoji('good morning').output).toBe('🌅');
  });

  it('returns empty for empty input', () => {
    expect(englishToEmoji('   ').output).toBe('');
  });

  it('translates a whole sentence', () => {
    const r = englishToEmoji('I love pizza');
    expect(r.output).toContain('❤️');
    expect(r.output).toContain('🍕');
  });
});

describe('emojiToEnglish', () => {
  it('glosses known emoji', () => {
    expect(emojiToEnglish('🐱').output).toBe('cat');
  });

  it('glosses a sequence in order', () => {
    expect(emojiToEnglish('🐱🍕').output).toBe('cat pizza');
  });

  it('passes unknown emoji through', () => {
    const out = emojiToEnglish('🐱🛼').output;
    expect(out).toContain('cat');
    expect(out).toContain('🛼');
  });

  it('handles variation selectors', () => {
    expect(emojiToEnglish('❤️').output).toBe('love');
  });

  it('returns empty for empty input', () => {
    expect(emojiToEnglish('  ').output).toBe('');
  });
});

describe('translate dispatch', () => {
  it('routes by direction', () => {
    expect(translate('cat', 'to-emoji').output).toBe('🐱');
    expect(translate('🐱', 'to-english').output).toBe('cat');
  });
});

describe('adjective forms', () => {
  it('maps -y adjectives to their noun emoji', () => {
    expect(englishToEmoji('rainy').output).toBe('🌧️');
    expect(englishToEmoji('sunny').output).toBe('☀️');
  });
});
