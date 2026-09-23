import { describe, expect, it } from 'vitest';
import { compressPrompt } from '../src/core/compress.js';
import { summarize } from '../src/core/summary.js';

describe('summarize', () => {
  it('reports zero savings when nothing changed', () => {
    const result = compressPrompt('short', 'light');
    const summary = summarize(result);
    expect(summary.savedTokens).toBe(0);
    expect(summary.savedPercent).toBe(0);
  });

  it('reports positive savings and a retention score after real compression', () => {
    const text = 'Please just do this now. In order to succeed, please be very careful and please be kind.';
    const result = compressPrompt(text, 'aggressive');
    const summary = summarize(result);
    expect(summary.original.estimatedTokens).toBeGreaterThan(summary.compressed.estimatedTokens);
    expect(summary.savedTokens).toBeGreaterThan(0);
    expect(summary.savedPercent).toBeGreaterThan(0);
    expect(summary.retention.score).toBeGreaterThanOrEqual(0);
    expect(summary.retention.score).toBeLessThanOrEqual(100);
  });

  it('handles empty input without dividing by zero', () => {
    const result = compressPrompt('', 'light');
    const summary = summarize(result);
    expect(summary.savedPercent).toBe(0);
    expect(summary.savedTokens).toBe(0);
  });
});
