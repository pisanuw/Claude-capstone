import { describe, it, expect, vi } from 'vitest';
import { assertSafeUrl, fetchPage, FetchError } from '../src/engine/fetchPage.js';

describe('assertSafeUrl', () => {
  it('accepts public http and https URLs', () => {
    expect(assertSafeUrl('https://example.com').hostname).toBe('example.com');
    expect(assertSafeUrl('http://example.com/path').protocol).toBe('http:');
  });

  it('rejects non-URLs', () => {
    expect(() => assertSafeUrl('not a url')).toThrow(FetchError);
  });

  it('rejects non-http schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(FetchError);
    expect(() => assertSafeUrl('ftp://example.com')).toThrow(FetchError);
  });

  it('blocks loopback and metadata hosts', () => {
    expect(() => assertSafeUrl('http://localhost/')).toThrow(FetchError);
    expect(() => assertSafeUrl('http://127.0.0.1/')).toThrow(FetchError);
    expect(() => assertSafeUrl('http://metadata.google.internal/')).toThrow(FetchError);
  });

  it('blocks private network ranges', () => {
    expect(() => assertSafeUrl('http://10.0.0.5/')).toThrow(FetchError);
    expect(() => assertSafeUrl('http://192.168.1.1/')).toThrow(FetchError);
    expect(() => assertSafeUrl('http://172.16.0.1/')).toThrow(FetchError);
  });
});

function mockResponse(body: string, init: Partial<Response> & { headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers ?? { 'content-type': 'text/html' });
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    url: init.url ?? 'https://example.com/',
    headers,
    text: async () => body,
  } as unknown as Response;
}

describe('fetchPage', () => {
  it('returns html and metadata on success', async () => {
    const fakeFetch = vi.fn(async () => mockResponse('<html><body>hi</body></html>'));
    const page = await fetchPage('https://example.com', fakeFetch as unknown as typeof fetch);
    expect(page.html).toContain('hi');
    expect(page.finalUrl).toBe('https://example.com/');
    expect(page.fetchedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('throws on a non-OK HTTP status', async () => {
    const fakeFetch = vi.fn(async () => mockResponse('', { ok: false, status: 404 }));
    await expect(
      fetchPage('https://example.com', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('throws when the content type is not HTML', async () => {
    const fakeFetch = vi.fn(async () =>
      mockResponse('{}', { headers: { 'content-type': 'application/json' } }),
    );
    await expect(
      fetchPage('https://example.com', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/HTML/);
  });

  it('wraps network errors in a friendly FetchError', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      fetchPage('https://example.com', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(FetchError);
  });

  it('reports a timeout when the fetch aborts', async () => {
    const fakeFetch = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    await expect(
      fetchPage('https://example.com', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/timed out/);
  });

  it('refuses unsafe URLs before fetching', async () => {
    const fakeFetch = vi.fn();
    await expect(
      fetchPage('http://localhost', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(FetchError);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
