import { describe, expect, it } from 'vitest';
import { HarParseError, header, parseHar, resourceType } from '../src/core/har';

function harDoc(entries: unknown[]): string {
  return JSON.stringify({
    log: { version: '1.2', creator: { name: 'test', version: '1' }, entries },
  });
}

function rawEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startedDateTime: '2026-08-21T10:00:00.000Z',
    time: 120,
    request: { method: 'get', url: 'https://app.test/a', headers: [{ name: 'X-Req', value: '1' }], ...(overrides.request as object) },
    response: {
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/2.0',
      headers: [{ name: 'Content-Type', value: 'text/html' }],
      content: { size: 500, mimeType: 'text/html' },
      redirectURL: '',
      ...(overrides.response as object),
    },
    timings: { blocked: 2, dns: -1, connect: -1, ssl: -1, send: 1, wait: 80, receive: 10 },
    ...overrides,
  };
}

describe('parseHar', () => {
  it('rejects non-JSON input with a friendly message', () => {
    expect(() => parseHar('not json')).toThrow(HarParseError);
    expect(() => parseHar('not json')).toThrow(/not valid JSON/);
  });

  it('rejects JSON without log.entries', () => {
    expect(() => parseHar('{"hello": 1}')).toThrow(/log\.entries/);
  });

  it('rejects a HAR whose every entry is unusable', () => {
    expect(() => parseHar(harDoc([{ bogus: true }]))).toThrow(/No usable entries/);
  });

  it('parses a minimal valid entry and normalizes fields', () => {
    const parsed = parseHar(harDoc([rawEntry()]));
    expect(parsed.entries).toHaveLength(1);
    const e = parsed.entries[0];
    expect(e.method).toBe('GET');
    expect(e.origin).toBe('https://app.test');
    expect(e.path).toBe('/a');
    expect(e.type).toBe('document');
    expect(e.httpVersion).toBe('http/2.0');
    expect(e.status).toBe(200);
    expect(e.start).toBe(0);
    expect(e.phases.dns).toBe(0); // -1 clamped
    expect(e.phases.wait).toBe(80);
    expect(header(e.responseHeaders, 'CONTENT-TYPE')).toBe('text/html');
    expect(header(e.requestHeaders, 'x-req')).toBe('1');
    expect(header(e.responseHeaders, 'missing')).toBeNull();
    expect(parsed.creator).toBe('test 1');
    expect(parsed.startedAt).toBe('2026-08-21T10:00:00.000Z');
  });

  it('skips malformed entries with warnings instead of failing the file', () => {
    const parsed = parseHar(
      harDoc([rawEntry(), { startedDateTime: 'nope', request: { url: 'https://x.test/b' }, response: {} }, { no: 'request' }]),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(2);
    expect(parsed.warnings[1]).toMatch(/skipped/);
  });

  it('computes starts relative to the earliest entry and sorts by time', () => {
    const later = rawEntry({ startedDateTime: '2026-08-21T10:00:01.500Z' });
    const parsed = parseHar(harDoc([later, rawEntry()]));
    expect(parsed.entries[0].start).toBe(0);
    expect(parsed.entries[1].start).toBe(1500);
    expect(parsed.entries.map((e) => e.index)).toEqual([0, 1]);
  });

  it('prefers _transferSize, then bodySize+headersSize, then content.size', () => {
    const withTransfer = rawEntry({ response: { status: 200, content: { size: 500, mimeType: 'text/html' }, headers: [], _transferSize: 321 } });
    const withBody = rawEntry({ response: { status: 200, content: { size: 500, mimeType: 'text/html' }, headers: [], bodySize: 200, headersSize: 50 } });
    const bare = rawEntry({ response: { status: 200, content: { size: 500, mimeType: 'text/html' }, headers: [], bodySize: -1 } });
    const parsed = parseHar(harDoc([withTransfer, withBody, bare]));
    expect(parsed.entries.map((e) => e.transferSize)).toEqual([321, 250, 500]);
  });

  it('tolerates invalid URLs and missing timings', () => {
    const weird = rawEntry({ request: { method: 'GET', url: '::::', headers: [] }, timings: undefined });
    const parsed = parseHar(harDoc([weird]));
    expect(parsed.entries[0].origin).toBe('(invalid-url)');
    expect(parsed.entries[0].phases.wait).toBe(0);
  });

  it('marks Firefox/Chrome cache exports via _fromCache', () => {
    const cached = rawEntry({ _fromCache: 'memory' });
    const parsed = parseHar(harDoc([cached, rawEntry()]));
    expect(parsed.entries[0].fromCache).toBe(true);
    expect(parsed.entries[1].fromCache).toBe(false);
  });
});

describe('resourceType', () => {
  it('prefers the browser-declared resource type', () => {
    expect(resourceType('text/plain', 'https://x.test/a', 'fetch')).toBe('xhr');
    expect(resourceType('text/plain', 'https://x.test/a', 'XHR')).toBe('xhr');
    expect(resourceType('', 'https://x.test/a', 'stylesheet')).toBe('stylesheet');
    expect(resourceType('', 'https://x.test/a', 'font')).toBe('font');
    expect(resourceType('', 'https://x.test/a', 'media')).toBe('media');
    expect(resourceType('', 'https://x.test/a', 'image')).toBe('image');
    expect(resourceType('', 'https://x.test/a', 'document')).toBe('document');
    expect(resourceType('', 'https://x.test/a', 'script')).toBe('script');
  });

  it('falls back to the mime type', () => {
    expect(resourceType('text/html; charset=utf-8', 'https://x.test/a')).toBe('document');
    expect(resourceType('application/javascript', 'https://x.test/a')).toBe('script');
    expect(resourceType('text/css', 'https://x.test/a')).toBe('stylesheet');
    expect(resourceType('image/png', 'https://x.test/a')).toBe('image');
    expect(resourceType('font/woff2', 'https://x.test/a')).toBe('font');
    expect(resourceType('video/mp4', 'https://x.test/a')).toBe('media');
    expect(resourceType('application/json', 'https://x.test/a')).toBe('xhr');
  });

  it('falls back to the URL extension, then other', () => {
    expect(resourceType('', 'https://x.test/bundle.js?v=2')).toBe('script');
    expect(resourceType('', 'https://x.test/pic.webp')).toBe('image');
    expect(resourceType('', 'https://x.test/beacon')).toBe('other');
  });
});
