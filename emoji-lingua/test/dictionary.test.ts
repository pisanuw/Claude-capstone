import { describe, it, expect } from 'vitest';
import { WORD_TO_EMOJI, EMOJI_TO_WORD } from '../src/generated-dictionary.js';
import { englishToEmoji, emojiToEnglish } from '../src/translate.js';

describe('generated dictionary', () => {
  it('is large enough to cover ordinary English', () => {
    expect(Object.keys(WORD_TO_EMOJI).length).toBeGreaterThan(10000);
    expect(Object.keys(EMOJI_TO_WORD).length).toBeGreaterThan(3000);
  });

  it('includes multi-word phrase keys', () => {
    const phrases = Object.keys(WORD_TO_EMOJI).filter((k) => k.includes('_'));
    expect(phrases.length).toBeGreaterThan(500);
  });
});

describe('sentence-level coverage', () => {
  const sentences = [
    'She is running to the school because the bus is late',
    'My friend gave me a birthday cake and we danced all night',
    'The government announced a new policy about climate change',
    'Research shows that education improves economic growth',
    'He bought a beautiful house near the ocean last year',
  ];

  it('translates every word of ordinary sentences', () => {
    for (const s of sentences) {
      expect(englishToEmoji(s).untranslated).toEqual([]);
    }
  });

  it('produces emoji-dense output', () => {
    for (const s of sentences) {
      expect(/\p{Extended_Pictographic}/u.test(englishToEmoji(s).output)).toBe(true);
    }
  });
});

describe('vocabulary layers', () => {
  it('drops articles so output reads cleanly', () => {
    expect(englishToEmoji('the cat').output).toBe('🐱');
    expect(englishToEmoji('a dog').output).toBe('🐶');
  });

  it('handles irregular verb forms', () => {
    expect(englishToEmoji('gave').output).toBe('🎁');
    expect(englishToEmoji('bought').output).toBe('🛍️');
    expect(englishToEmoji('understood').output).toBe('🧠✅');
  });

  it('approximates abstract words with composed emoji', () => {
    expect(englishToEmoji('democracy').output).toBe('🗳️');
    expect(englishToEmoji('forecast').output).toBe('🔮📊');
    expect(englishToEmoji('justice').output).toBe('⚖️');
  });

  it('maps weather adjectives to weather, not lookalikes', () => {
    expect(englishToEmoji('sunny').output).toBe('☀️');
    expect(englishToEmoji('rainy').output).toBe('🌧️');
  });

  it('prefers curated meanings over raw CLDR keyword hits', () => {
    expect(englishToEmoji('danced').output).toBe('💃');
    expect(englishToEmoji('running').output).toBe('🏃');
  });

  it('resolves derived forms through suffix rules', () => {
    expect(englishToEmoji('economic').untranslated).toEqual([]);
    expect(englishToEmoji('beautiful').untranslated).toEqual([]);
    expect(englishToEmoji('improvement').untranslated).toEqual([]);
  });

  it('glosses emoji back with natural words', () => {
    expect(emojiToEnglish('🎂').output).toBe('birthday');
    expect(emojiToEnglish('🌙').output).toBe('moon');
  });
});

describe('morphological suffix fallback', () => {
  // Each entry exercises a distinct suffix rule in lookupWord().
  const forms = [
    'cities', 'boxes', 'cats', 'swimming', 'jumped', 'quickly', 'cloudy',
    'teacher', 'happiness', 'creation', 'decision', 'agreement', 'activity',
    'political', 'atomic', 'natural', 'creative', 'famous', 'powerful',
    'homeless', 'readable', 'strongest', 'foggy', 'running',
  ];

  it('resolves inflected and derived forms without crashing', () => {
    for (const w of forms) {
      const r = englishToEmoji(w);
      expect(typeof r.output).toBe('string');
    }
  });

  it('resolves most derived forms to an emoji', () => {
    const resolved = forms.filter((w) => englishToEmoji(w).untranslated.length === 0);
    expect(resolved.length).toBeGreaterThan(forms.length * 0.8);
  });

  it('leaves genuinely unknown words alone', () => {
    const r = englishToEmoji('zzyzx');
    expect(r.output).toContain('zzyzx');
    expect(r.untranslated).toContain('zzyzx');
  });

  it('handles empty and whitespace input in both directions', () => {
    expect(englishToEmoji('   ').output).toBe('');
    expect(emojiToEnglish('   ').output).toBe('');
  });
});
