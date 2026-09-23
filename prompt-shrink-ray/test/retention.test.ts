import { describe, expect, it } from 'vitest';
import { computeRetention, extractSalientTerms } from '../src/core/retention.js';

const ORIGINAL = 'Use the Foo API with code `run()` and number 42.';

describe('extractSalientTerms', () => {
  it('extracts inline code, numbers, and probable proper nouns, skipping the first word', () => {
    const terms = extractSalientTerms(ORIGINAL);
    expect(terms).toEqual(expect.arrayContaining(['run()', '42', 'Foo', 'API']));
    expect(terms).not.toContain('Use');
  });

  it('extracts fenced code block contents as a single term', () => {
    const terms = extractSalientTerms('do this:\n```js\nconst x = 1;\n```');
    expect(terms).toContain('const x = 1;');
  });

  it('extracts quoted strings', () => {
    const terms = extractSalientTerms('reply with "OK" only');
    expect(terms).toContain('OK');
  });
});

describe('computeRetention', () => {
  it('scores 100 with no salient terms lost', () => {
    const report = computeRetention(ORIGINAL, ORIGINAL);
    expect(report.score).toBe(100);
    expect(report.missing).toEqual([]);
  });

  it('flags every term dropped from the compressed text', () => {
    const compressed = 'Use the API with number 42.';
    const report = computeRetention(ORIGINAL, compressed);
    expect(report.totalTerms).toBe(4);
    expect(report.retainedTerms).toBe(2);
    expect(report.score).toBe(50);
    expect(report.missing).toEqual(['run()', 'Foo']);
  });

  it('scores 100 when there are no salient terms to track at all', () => {
    const report = computeRetention('do the thing', 'nothing left');
    expect(report.totalTerms).toBe(0);
    expect(report.score).toBe(100);
  });
});
