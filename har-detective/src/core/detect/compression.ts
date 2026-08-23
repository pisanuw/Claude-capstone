/**
 * Text responses above a size floor that arrive without Content-Encoding are
 * paying full price for bytes gzip or brotli would cut by roughly 70%.
 */

import type { Entry, Finding } from '../types';
import { header } from '../har';
import { formatBytes } from '../format';
import { isCompressibleMime, isOkWithBody, sumBy } from './shared';

const MIN_BYTES = 10 * 1024;
const TYPICAL_SAVINGS = 0.7;

export function detectUncompressed(entries: Entry[]): Finding[] {
  const offenders = entries.filter((e) => {
    if (!isOkWithBody(e) || e.bodySize < MIN_BYTES || !isCompressibleMime(e.mimeType)) return false;
    const enc = header(e.responseHeaders, 'content-encoding');
    if (enc !== null && /\b(gzip|br|zstd|deflate)\b/i.test(enc)) return false;
    // If the wire size is already well below the decoded size, the export just
    // dropped the header; the response was in fact compressed.
    if (e.transferSize > 0 && e.transferSize < e.bodySize * 0.9) return false;
    return true;
  });
  if (offenders.length === 0) return [];

  const bytes = sumBy(offenders, (e) => e.bodySize);
  const saved = Math.round(bytes * TYPICAL_SAVINGS);
  return [
    {
      detector: 'uncompressed-responses',
      severity: saved > 300 * 1024 ? 'high' : 'medium',
      title: `${offenders.length} text response${offenders.length === 1 ? '' : 's'} served uncompressed`,
      explanation:
        `${formatBytes(bytes)} of HTML, JS, CSS, or JSON crossed the wire with no ` +
        `Content-Encoding. Gzip or brotli typically shrinks such payloads ~70%, ` +
        `saving about ${formatBytes(saved)} here.`,
      remediation:
        'Enable compression at the server or CDN (nginx: `gzip on; gzip_types text/plain application/json …;`, ' +
        'or turn on brotli in your CDN settings).',
      entries: offenders.map((e) => e.index),
      wastedBytes: saved,
    },
  ];
}
