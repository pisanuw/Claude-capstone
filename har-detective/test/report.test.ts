import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze';
import { toMarkdown } from '../src/core/report';
import { makeEntries } from './helpers';

describe('toMarkdown', () => {
  it('renders a full report with stats table and ranked findings', () => {
    const entries = makeEntries([
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ url: `https://a.test/api/items/${i}`, start: 0 })),
      { url: 'https://a.test/api/broken', status: 500, statusText: 'Internal Server Error' },
    ]);
    const analysis = analyze(entries);
    const md = toMarkdown(analysis, entries, 'session.har');

    expect(md).toContain('# HAR Detective report — session.har');
    expect(md).toContain('| Requests | 9 |');
    expect(md).toContain('## Findings');
    expect(md).toMatch(/### 1\. \[HIGH\]/);
    expect(md).toContain('**Fix:**');
    expect(md).toContain('- `GET https://a.test/api/items/1`');
    // N+1 finding lists 8 requests, capped at 6 with a remainder line.
    expect(md).toContain('…and 2 more');
    expect(md).toContain('never left the browser');
  });

  it('handles a clean session', () => {
    const entries = makeEntries([
      { url: 'https://a.test/x.js', type: 'script', responseHeaders: { 'cache-control': 'public, max-age=31536000, immutable' } },
    ]);
    const analysis = analyze(entries);
    const md = toMarkdown(analysis, entries, 'clean.har');
    expect(md).toContain('No issues detected.');
  });
});
