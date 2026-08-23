import type { Entry } from '../types';

/** Resource types that represent cacheable static assets. */
export const STATIC_TYPES = new Set(['script', 'stylesheet', 'image', 'font', 'media']);

/** Entries that represent application API traffic. */
export function isApiCall(e: Entry): boolean {
  return e.type === 'xhr';
}

/**
 * Collapse variable path segments so /api/users/17 and /api/users/94 share a
 * template. Numeric ids, UUIDs, and long hex/hash-like segments become {id}.
 */
export function pathTemplate(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (/^\d+$/.test(seg)) return '{id}';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{id}';
      if (/^[0-9a-f]{16,}$/i.test(seg)) return '{id}';
      return seg;
    })
    .join('/');
}

/** True when the response is a success that actually carried a body. */
export function isOkWithBody(e: Entry): boolean {
  return e.status >= 200 && e.status < 300 && e.status !== 204 && !e.fromCache;
}

/** Mime types that compress well with gzip/brotli. */
export function isCompressibleMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim();
  return (
    m.startsWith('text/') ||
    m.includes('json') ||
    m.includes('xml') ||
    m.includes('javascript') ||
    m === 'image/svg+xml'
  );
}

export function sumBy(entries: Entry[], f: (e: Entry) => number): number {
  return entries.reduce((acc, e) => acc + f(e), 0);
}
