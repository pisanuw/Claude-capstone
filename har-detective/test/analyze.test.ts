import { describe, expect, it } from 'vitest';
import { analyze, narrative, rankFindings, sessionStats } from '../src/core/analyze';
import { makeEntries } from './helpers';
import type { Finding } from '../src/core/types';

function finding(overrides: Partial<Finding>): Finding {
  return {
    detector: 'x',
    severity: 'medium',
    title: 'A finding',
    explanation: 'because',
    remediation: 'fix it',
    entries: [0],
    ...overrides,
  };
}

describe('rankFindings', () => {
  it('orders by severity, then estimated impact', () => {
    const ranked = rankFindings([
      finding({ title: 'small medium', severity: 'medium', wastedMs: 10 }),
      finding({ title: 'low', severity: 'low' }),
      finding({ title: 'big medium', severity: 'medium', wastedBytes: 1024 * 500 }),
      finding({ title: 'high', severity: 'high' }),
    ]);
    expect(ranked.map((f) => f.title)).toEqual(['high', 'big medium', 'small medium', 'low']);
  });
});

describe('sessionStats', () => {
  it('aggregates counts, bytes, duration, and breakdowns', () => {
    const entries = makeEntries([
      { url: 'https://a.test/', type: 'document', transferSize: 100, bodySize: 300, start: 0, time: 50 },
      { url: 'https://a.test/x.js', type: 'script', transferSize: 200, bodySize: 400, start: 40, time: 100 },
      { url: 'https://b.test/api', type: 'xhr', transferSize: 50, bodySize: 50, status: 500, start: 60, time: 30 },
      { url: 'https://a.test/y.css', type: 'stylesheet', transferSize: 0, bodySize: 0, status: 304, start: 10, time: 5 },
    ]);
    const s = sessionStats(entries);
    expect(s.requestCount).toBe(4);
    expect(s.originCount).toBe(2);
    expect(s.totalTransfer).toBe(350);
    expect(s.totalDecoded).toBe(750);
    expect(s.duration).toBe(140);
    expect(s.errorCount).toBe(1);
    expect(s.cachedCount).toBe(1);
    expect(s.byType[0]).toEqual({ type: 'script', count: 1, transferSize: 200 });
    expect(s.topOrigins[0].origin).toBe('https://a.test');
    expect(s.topOrigins[0].count).toBe(3);
  });
});

describe('narrative', () => {
  it('describes a clean session', () => {
    const s = sessionStats(makeEntries([{}]));
    const text = narrative(s, []);
    expect(text).toContain('1 requests to 1 origin');
    expect(text).toContain('clean session');
  });

  it('summarizes findings and highlights the top one', () => {
    const s = sessionStats(makeEntries([{ status: 500 }, { fromCache: true }]));
    const text = narrative(s, [
      finding({ severity: 'high', title: 'Redirect chain of 3 hops' }),
      finding({ severity: 'low' }),
    ]);
    expect(text).toContain('1 request failed outright');
    expect(text).toContain('1 came from cache');
    expect(text).toContain('2 issues were found, 1 of them high severity');
    expect(text).toContain('Biggest win: redirect chain of 3 hops.');
  });
});

describe('analyze', () => {
  it('produces ranked findings from a raw entry list', () => {
    const entries = makeEntries([
      { url: 'https://a.test/api/slow', time: 3000, phases: { wait: 2900 } },
      { url: 'https://a.test/x.js', type: 'script', transferSize: 5_000 },
    ]);
    const result = analyze(entries);
    expect(result.findings.map((f) => f.detector)).toContain('slow-ttfb');
    expect(result.findings.map((f) => f.detector)).toContain('missing-cache-headers');
    expect(result.stats.requestCount).toBe(2);
    expect(result.narrative).toContain('2 requests');
    // Ranked: high severity slow-ttfb before medium cache finding.
    expect(result.findings[0].detector).toBe('slow-ttfb');
  });
});
