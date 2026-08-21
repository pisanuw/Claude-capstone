import { describe, expect, it } from 'vitest';
import { buildHtmlReport, summarize, summaryLine } from '../src/core/report';
import type { DiffResult, Region } from '../src/core/types';

function makeResult(regions: Region[], overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    width: 100,
    height: 80,
    mask: new Uint8Array(100 * 80),
    regions,
    changedRatio: 0.0421,
    identical: regions.length === 0,
    sizeMismatch: false,
    ...overrides,
  };
}

const sample: Region[] = [
  { box: { x: 1, y: 2, w: 3, h: 4 }, changedPixels: 10, type: 'text', confidence: 0.8, reason: 'a <b> edit' },
  { box: { x: 5, y: 6, w: 7, h: 8 }, changedPixels: 20, type: 'text', confidence: 0.7, reason: 'another' },
  { box: { x: 9, y: 9, w: 2, h: 2 }, changedPixels: 30, type: 'color', confidence: 0.9, reason: 'restyle' },
];

describe('summarize / summaryLine', () => {
  it('counts regions per type', () => {
    expect(summarize(sample)).toEqual({ text: 2, color: 1 });
  });

  it('builds a readable one-liner', () => {
    const line = summaryLine(makeResult(sample));
    expect(line).toBe('3 changes: 2 text edits, 1 color');
  });

  it('handles the identical case and singular counts', () => {
    expect(summaryLine(makeResult([]))).toBe('No differences found.');
    expect(summaryLine(makeResult([sample[2]]))).toBe('1 change: 1 color');
  });
});

describe('buildHtmlReport', () => {
  it('produces a standalone document with images, overlay, and rows', () => {
    const html = buildHtmlReport(makeResult(sample), 'data:image/png;base64,AAA', 'data:image/png;base64,BBB', '2026-08-21');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data:image/png;base64,AAA');
    expect(html).toContain('data:image/png;base64,BBB');
    expect(html).toContain('<svg');
    expect((html.match(/<tr><td/g) ?? []).length).toBe(3);
    expect(html).toContain('a &lt;b&gt; edit');
    expect(html).toContain('4.21% of pixels changed');
    expect(html).toContain('generated 2026-08-21');
    // Self-contained: no external resource loads (the SVG xmlns URI is not a request).
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('mentions dimension padding when sizes mismatched', () => {
    const html = buildHtmlReport(
      makeResult(sample, { sizeMismatch: true }),
      'data:a',
      'data:b',
      '2026-08-21',
    );
    expect(html).toContain('different dimensions');
  });
});
