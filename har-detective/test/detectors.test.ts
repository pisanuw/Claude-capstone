import { describe, expect, it } from 'vitest';
import { makeEntries } from './helpers';
import { detectRepeatedCalls } from '../src/core/detect/repeatedCalls';
import { cacheVerdict, detectMissingCacheHeaders } from '../src/core/detect/caching';
import { detectUncompressed } from '../src/core/detect/compression';
import { detectLargePayloads } from '../src/core/detect/largePayloads';
import { detectRedirectChains } from '../src/core/detect/redirects';
import { detectSequentialChains } from '../src/core/detect/sequentialChains';
import { detectErrors } from '../src/core/detect/errors';
import { detectSlowRequests } from '../src/core/detect/slowRequests';
import { detectDuplicates } from '../src/core/detect/duplicates';
import { detectProtocolOverhead } from '../src/core/detect/protocol';
import { pathTemplate } from '../src/core/detect/shared';

describe('pathTemplate', () => {
  it('collapses numeric, uuid, and hash-like segments', () => {
    expect(pathTemplate('/api/users/17/orders/94')).toBe('/api/users/{id}/orders/{id}');
    expect(pathTemplate('/u/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('/u/{id}');
    expect(pathTemplate('/blob/deadbeefdeadbeef01')).toBe('/blob/{id}');
    expect(pathTemplate('/api/users/list')).toBe('/api/users/list');
  });
});

describe('detectRepeatedCalls', () => {
  it('flags many API calls to one endpoint template', () => {
    const entries = makeEntries(
      [1, 2, 3, 4, 5, 6].map((i) => ({ url: `https://app.test/api/items/${i}`, type: 'xhr' as const })),
    );
    const [f] = detectRepeatedCalls(entries);
    expect(f.detector).toBe('repeated-calls');
    expect(f.severity).toBe('high');
    expect(f.entries).toHaveLength(6);
    expect(f.title).toContain('/api/items/{id}');
  });

  it('ignores static assets, small groups, and same-URL duplicates', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/items/1', type: 'xhr' },
      { url: 'https://app.test/api/items/2', type: 'xhr' },
      // same concrete URL three times -> duplicates detector's job, not N+1
      { url: 'https://app.test/api/config', type: 'xhr' },
      { url: 'https://app.test/api/config', type: 'xhr' },
      { url: 'https://app.test/api/config', type: 'xhr' },
      { url: 'https://app.test/img/1.png', type: 'image' },
      { url: 'https://app.test/img/2.png', type: 'image' },
      { url: 'https://app.test/img/3.png', type: 'image' },
      { url: 'https://app.test/img/4.png', type: 'image' },
    ]);
    expect(detectRepeatedCalls(entries)).toHaveLength(0);
  });
});

describe('cacheVerdict / detectMissingCacheHeaders', () => {
  it('judges individual policies', () => {
    const cases: Array<[Record<string, string>, boolean]> = [
      [{}, true],
      [{ 'cache-control': 'no-store' }, true],
      [{ 'cache-control': 'no-cache' }, true],
      [{ 'cache-control': 'max-age=0' }, true],
      [{ 'cache-control': 'max-age=120' }, true],
      [{ 'cache-control': 'max-age=120, immutable' }, false],
      [{ 'cache-control': 'public, max-age=31536000' }, false],
      [{ 'cache-control': 'public' }, false],
      [{ 'cache-control': 'private' }, true],
      [{ expires: 'Thu, 01 Jan 2027 00:00:00 GMT' }, false],
    ];
    for (const [headers, uncached] of cases) {
      const [e] = makeEntries([{ type: 'script', responseHeaders: headers }]);
      expect(cacheVerdict(e).uncached, JSON.stringify(headers)).toBe(uncached);
    }
  });

  it('groups offenders into one finding with byte totals', () => {
    const entries = makeEntries([
      { type: 'script', url: 'https://app.test/a.js', transferSize: 10_000 },
      { type: 'image', url: 'https://app.test/b.png', transferSize: 20_000 },
      { type: 'xhr', url: 'https://app.test/api/x' }, // not static
      { type: 'font', url: 'https://app.test/c.woff2', responseHeaders: { 'cache-control': 'max-age=31536000' } },
      { type: 'stylesheet', url: 'https://app.test/d.css', status: 304 }, // no body
      { type: 'script', url: 'https://app.test/e.js', fromCache: true },
    ]);
    const findings = detectMissingCacheHeaders(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0].entries).toEqual([0, 1]);
    expect(findings[0].wastedBytes).toBe(30_000);
    expect(findings[0].severity).toBe('medium');
  });

  it('returns nothing when caching is healthy', () => {
    const entries = makeEntries([
      { type: 'script', responseHeaders: { 'cache-control': 'public, max-age=31536000, immutable' } },
    ]);
    expect(detectMissingCacheHeaders(entries)).toHaveLength(0);
  });
});

describe('detectUncompressed', () => {
  it('flags large text bodies without Content-Encoding', () => {
    const entries = makeEntries([
      { mimeType: 'application/json', bodySize: 200_000, transferSize: 200_000 },
      { mimeType: 'text/html', type: 'document', bodySize: 50_000, transferSize: 50_000 },
    ]);
    const [f] = detectUncompressed(entries);
    expect(f.detector).toBe('uncompressed-responses');
    expect(f.entries).toHaveLength(2);
    expect(f.wastedBytes).toBe(Math.round(250_000 * 0.7));
  });

  it('skips compressed, binary, small, and implicitly-compressed responses', () => {
    const entries = makeEntries([
      { mimeType: 'application/json', bodySize: 200_000, responseHeaders: { 'content-encoding': 'gzip' } },
      { mimeType: 'image/png', type: 'image', bodySize: 500_000 },
      { mimeType: 'application/json', bodySize: 2_000 },
      // wire size far below decoded size -> was compressed, header just missing
      { mimeType: 'application/json', bodySize: 200_000, transferSize: 60_000 },
    ]);
    expect(detectUncompressed(entries)).toHaveLength(0);
  });
});

describe('detectLargePayloads', () => {
  it('flags >1MB assets and >250KB JSON separately', () => {
    const entries = makeEntries([
      { type: 'image', mimeType: 'image/jpeg', url: 'https://app.test/big.jpg', transferSize: 2_000_000, bodySize: 2_000_000 },
      { type: 'xhr', mimeType: 'application/json', url: 'https://app.test/api/all', bodySize: 400_000, transferSize: 90_000 },
      { type: 'script', transferSize: 500_000, bodySize: 500_000, mimeType: 'application/javascript' },
    ]);
    const findings = detectLargePayloads(entries);
    expect(findings.map((f) => f.detector).sort()).toEqual(['large-json', 'large-payloads']);
    expect(findings.find((f) => f.detector === 'large-payloads')!.entries).toEqual([0]);
    expect(findings.find((f) => f.detector === 'large-json')!.entries).toEqual([1]);
  });
});

describe('detectRedirectChains', () => {
  it('reconstructs a chain and rates multi-hop chains high', () => {
    const entries = makeEntries([
      { url: 'http://app.test/', status: 301, redirectURL: 'https://app.test/', time: 90, mimeType: '', type: 'document' },
      { url: 'https://app.test/', status: 302, redirectURL: 'https://app.test/home', time: 80, mimeType: '', type: 'document' },
      { url: 'https://app.test/home', status: 200, type: 'document', mimeType: 'text/html' },
    ]);
    const findings = detectRedirectChains(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].entries).toEqual([0, 1]);
    expect(findings[0].wastedMs).toBe(170);
    expect(findings[0].remediation).toContain('Strict-Transport-Security');
  });

  it('reports a lone redirect as low severity', () => {
    const entries = makeEntries([
      { url: 'https://app.test/old', status: 301, redirectURL: 'https://app.test/new', type: 'document', mimeType: '' },
    ]);
    const [f] = detectRedirectChains(entries);
    expect(f.severity).toBe('low');
  });

  it('returns nothing without redirects', () => {
    expect(detectRedirectChains(makeEntries([{}]))).toHaveLength(0);
  });
});

describe('detectSequentialChains', () => {
  it('finds strictly sequential API calls and estimates parallel savings', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/a', start: 0, time: 200 },
      { url: 'https://app.test/api/b', start: 220, time: 300 },
      { url: 'https://app.test/api/c', start: 540, time: 250 },
    ]);
    const [f] = detectSequentialChains(entries);
    expect(f.detector).toBe('sequential-chain');
    expect(f.entries).toEqual([0, 1, 2]);
    // elapsed 790, slowest 300 -> 490 avoidable
    expect(f.wastedMs).toBe(490);
  });

  it('does not flag overlapping (already parallel) calls', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/a', start: 0, time: 200 },
      { url: 'https://app.test/api/b', start: 10, time: 200 },
      { url: 'https://app.test/api/c', start: 20, time: 200 },
    ]);
    expect(detectSequentialChains(entries)).toHaveLength(0);
  });

  it('breaks chains on think-time gaps', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/a', start: 0, time: 100 },
      { url: 'https://app.test/api/b', start: 2000, time: 100 },
      { url: 'https://app.test/api/c', start: 4000, time: 100 },
    ]);
    expect(detectSequentialChains(entries)).toHaveLength(0);
  });
});

describe('detectErrors', () => {
  it('groups failures by status and endpoint template', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/track', status: 500, statusText: 'Internal Server Error', method: 'POST' },
      { url: 'https://app.test/api/track', status: 500, statusText: 'Internal Server Error', method: 'POST' },
      { url: 'https://app.test/api/old', status: 404, statusText: 'Not Found' },
      { url: 'https://app.test/api/aborted', status: 0, statusText: '' },
      { url: 'https://app.test/ok', status: 200 },
    ]);
    const findings = detectErrors(entries);
    expect(findings).toHaveLength(3);
    const f500 = findings.find((f) => f.title.includes('500'))!;
    expect(f500.severity).toBe('high');
    expect(f500.entries).toHaveLength(2);
    expect(findings.find((f) => f.title.includes('404'))!.severity).toBe('medium');
    expect(findings.find((f) => f.title.includes('no response'))!.severity).toBe('high');
  });
});

describe('detectSlowRequests', () => {
  it('flags wait-dominated slow requests', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/slow', time: 2000, phases: { wait: 1900 } },
      { url: 'https://app.test/api/fast', time: 100, phases: { wait: 60 } },
      // slow but download-dominated: not the server's fault
      { url: 'https://app.test/big.bin', time: 3000, phases: { wait: 400, receive: 2600 } },
    ]);
    const [f] = detectSlowRequests(entries);
    expect(f.entries).toEqual([0]);
    expect(f.severity).toBe('medium');
  });

  it('rates multi-second think time high', () => {
    const entries = makeEntries([{ time: 3000, phases: { wait: 2900 } }]);
    expect(detectSlowRequests(entries)[0].severity).toBe('high');
  });

  it('returns nothing for a fast session', () => {
    expect(detectSlowRequests(makeEntries([{}]))).toHaveLength(0);
  });
});

describe('detectDuplicates', () => {
  it('flags the same GET URL fetched repeatedly with a body', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/config', transferSize: 50_000 },
      { url: 'https://app.test/api/config', transferSize: 50_000 },
      { url: 'https://app.test/api/config', transferSize: 50_000 },
      { url: 'https://app.test/api/other' },
    ]);
    const [f] = detectDuplicates(entries);
    expect(f.entries).toEqual([0, 1, 2]);
    expect(f.wastedBytes).toBe(100_000);
  });

  it('ignores POSTs, 304s, and cache hits', () => {
    const entries = makeEntries([
      { url: 'https://app.test/api/save', method: 'POST' },
      { url: 'https://app.test/api/save', method: 'POST' },
      { url: 'https://app.test/a.js', status: 304 },
      { url: 'https://app.test/a.js', status: 304 },
      { url: 'https://app.test/b.js', fromCache: true },
      { url: 'https://app.test/b.js', fromCache: true },
    ]);
    expect(detectDuplicates(entries)).toHaveLength(0);
  });
});

describe('detectProtocolOverhead', () => {
  it('flags HTTP/1.x origins that keep opening new connections', () => {
    const entries = makeEntries(
      [0, 1, 2, 3, 4].map((i) => ({
        url: `https://legacy.test/w/${i}.js`,
        type: 'script' as const,
        httpVersion: 'http/1.1',
        phases: { dns: i === 0 ? 20 : 0, connect: 40, ssl: 30, wait: 50 },
      })),
    );
    const [f] = detectProtocolOverhead(entries);
    expect(f.detector).toBe('http1-connection-churn');
    expect(f.severity).toBe('high');
    expect(f.wastedMs).toBe(20 + 5 * 70);
  });

  it('stays quiet for HTTP/2 and for reused HTTP/1.1 connections', () => {
    const h2 = makeEntries(
      [0, 1, 2, 3].map((i) => ({ url: `https://a.test/${i}`, httpVersion: 'http/2.0', phases: { connect: 40 } })),
    );
    expect(detectProtocolOverhead(h2)).toHaveLength(0);
    const reused = makeEntries(
      [0, 1, 2, 3].map((i) => ({ url: `https://b.test/${i}`, httpVersion: 'http/1.1', phases: { connect: i === 0 ? 40 : 0, dns: 0 } })),
    );
    expect(detectProtocolOverhead(reused)).toHaveLength(0);
  });
});
