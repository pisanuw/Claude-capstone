import { describe, expect, it } from 'vitest';
import { compressPrompt, compressSectionText, normalizeWhitespace, trimExampleGroups } from '../src/core/compress.js';

describe('normalizeWhitespace', () => {
  it('collapses repeated spaces and blank lines and trims the ends', () => {
    expect(normalizeWhitespace('  a   b  \n\n\n\nc  ')).toBe('a b\n\nc');
  });
});

describe('trimExampleGroups', () => {
  it('keeps the first two numbered examples and notes how many were dropped', () => {
    const text = 'Examples:\nExample 1: a\nExample 2: b\nExample 3: c\nExample 4: d';
    const { text: result, applied } = trimExampleGroups(text);
    expect(applied).toBe(true);
    expect(result).toContain('Example 1: a');
    expect(result).toContain('Example 2: b');
    expect(result).not.toContain('Example 3');
    expect(result).toContain('(+2 more examples omitted for brevity)');
  });

  it('uses singular phrasing for exactly one dropped example', () => {
    const text = 'Example 1: a\nExample 2: b\nExample 3: c';
    const { text: result } = trimExampleGroups(text);
    expect(result).toContain('(+1 more example omitted for brevity)');
  });

  it('is a no-op with two or fewer examples', () => {
    const text = 'Example 1: a\nExample 2: b';
    const { text: result, applied } = trimExampleGroups(text);
    expect(applied).toBe(false);
    expect(result).toBe(text);
  });

  it('is a no-op when there is no numbered example at all', () => {
    const { applied } = trimExampleGroups('just a plain paragraph');
    expect(applied).toBe(false);
  });
});

describe('compressSectionText', () => {
  it('removes filler words and records which rules ran', () => {
    const result = compressSectionText({ kind: 'user', text: 'Please just do this now.' }, 'light', new Set());
    expect(result.after).toBe('just do this now.');
    expect(result.rulesApplied).toContain('filler-words');
  });

  it('never rewrites content inside a fenced code block', () => {
    const text = 'Please run this:\n```js\nplease.stay();\n```';
    const result = compressSectionText({ kind: 'user', text }, 'aggressive', new Set());
    expect(result.after).toContain('please.stay();');
  });

  it('leaves example sections alone under sentence dedup', () => {
    const seen = new Set<string>(['respond only in json']);
    const result = compressSectionText(
      { kind: 'example', text: 'Example 1: Respond only in JSON. Example 2: also fine.' },
      'medium',
      seen,
    );
    expect(result.after).toContain('Respond only in JSON');
  });
});

describe('compressPrompt', () => {
  it('drops a later section that duplicates an earlier one entirely', () => {
    const text = 'System: Be nice.\n\nSystem: Be nice.';
    const result = compressPrompt(text, 'medium');
    expect(result.sections).toHaveLength(1);
  });

  it('dedups a single repeated instruction sentence across sections, keeping the rest', () => {
    const text = 'System:\nBe accurate. Respond only in JSON.\n\nUser:\nAnswer politely. Respond only in JSON.';
    const result = compressPrompt(text, 'medium');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].after).toContain('Respond only in JSON');
    expect(result.sections[1].after).not.toContain('Respond only in JSON');
    expect(result.sections[1].after).toContain('Answer politely');
  });

  it('applies verbose-phrase simplification and hedge removal only at medium/aggressive', () => {
    const text = 'In order to succeed, I think you sort of need practice.';
    const light = compressPrompt(text, 'light');
    const aggressive = compressPrompt(text, 'aggressive');
    expect(light.compressedText).toContain('In order to');
    expect(aggressive.compressedText).not.toContain('In order to');
    expect(aggressive.compressedText.toLowerCase()).not.toContain('i think');
  });

  it('trims a long example section only at the aggressive level', () => {
    const text = 'Examples:\nExample 1: a\nExample 2: b\nExample 3: c\nExample 4: d';
    const medium = compressPrompt(text, 'medium');
    const aggressive = compressPrompt(text, 'aggressive');
    expect(medium.compressedText).toContain('Example 3');
    expect(aggressive.compressedText).not.toContain('Example 3');
    expect(aggressive.compressedText).toContain('omitted for brevity');
  });

  it('returns an empty result for empty input', () => {
    const result = compressPrompt('', 'light');
    expect(result.sections).toEqual([]);
    expect(result.compressedText).toBe('');
  });
});
