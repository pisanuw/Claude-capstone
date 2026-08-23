/**
 * Cache-header audit for static assets: a 200 response for a script, style,
 * image, or font with no Cache-Control (or an effectively-zero max-age) is
 * re-downloaded on every visit.
 */

import type { Entry, Finding } from '../types';
import { header } from '../har';
import { formatBytes } from '../format';
import { STATIC_TYPES, isOkWithBody, sumBy } from './shared';

const SHORT_MAX_AGE = 3600; // under an hour on a static asset is effectively uncached

interface CacheVerdict {
  uncached: boolean;
  reason: string;
}

/** Judge one response's caching policy. Exported for direct testing. */
export function cacheVerdict(e: Entry): CacheVerdict {
  const cc = header(e.responseHeaders, 'cache-control');
  if (cc === null) {
    if (header(e.responseHeaders, 'expires') !== null) {
      return { uncached: false, reason: 'legacy Expires header' };
    }
    return { uncached: true, reason: 'no Cache-Control header' };
  }
  const v = cc.toLowerCase();
  if (v.includes('no-store')) return { uncached: true, reason: 'Cache-Control: no-store' };
  if (v.includes('no-cache')) return { uncached: true, reason: 'Cache-Control: no-cache' };
  const m = v.match(/max-age=(\d+)/);
  if (m) {
    const age = Number(m[1]);
    if (age === 0) return { uncached: true, reason: 'max-age=0' };
    if (age < SHORT_MAX_AGE && !v.includes('immutable')) {
      return { uncached: true, reason: `short max-age=${age}` };
    }
    return { uncached: false, reason: 'cached' };
  }
  if (v.includes('immutable') || v.includes('public')) return { uncached: false, reason: 'cached' };
  return { uncached: true, reason: `unclear Cache-Control: ${cc}` };
}

export function detectMissingCacheHeaders(entries: Entry[]): Finding[] {
  const offenders: Entry[] = [];
  const reasons = new Map<string, number>();
  for (const e of entries) {
    if (!STATIC_TYPES.has(e.type) || !isOkWithBody(e)) continue;
    const verdict = cacheVerdict(e);
    if (!verdict.uncached) continue;
    offenders.push(e);
    reasons.set(verdict.reason, (reasons.get(verdict.reason) ?? 0) + 1);
  }
  if (offenders.length === 0) return [];

  const bytes = sumBy(offenders, (e) => e.transferSize);
  const reasonText = [...reasons.entries()].map(([r, n]) => `${r} (${n})`).join(', ');
  return [
    {
      detector: 'missing-cache-headers',
      severity: offenders.length >= 5 || bytes > 500 * 1024 ? 'high' : 'medium',
      title: `${offenders.length} static asset${offenders.length === 1 ? '' : 's'} served without usable cache headers`,
      explanation:
        `${offenders.length} scripts, styles, images, or fonts totalling ${formatBytes(bytes)} ` +
        `will be re-downloaded on every visit. Problems seen: ${reasonText}.`,
      remediation:
        'Serve fingerprinted static assets with `Cache-Control: public, max-age=31536000, immutable` ' +
        'and let the filename hash handle invalidation.',
      entries: offenders.map((e) => e.index),
      wastedBytes: bytes,
    },
  ];
}
