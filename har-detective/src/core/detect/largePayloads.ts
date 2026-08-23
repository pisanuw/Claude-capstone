/**
 * Oversized responses: one detector for any body over a hard ceiling, with a
 * lower ceiling for JSON API responses, which usually means an unpaginated
 * list or heavily over-fetched fields.
 */

import type { Entry, Finding } from '../types';
import { formatBytes, shortPath } from '../format';
import { isApiCall, isOkWithBody } from './shared';

const ANY_LIMIT = 1024 * 1024; // 1 MB on the wire for anything
const JSON_LIMIT = 250 * 1024; // 250 KB decoded for an API response

export function detectLargePayloads(entries: Entry[]): Finding[] {
  const findings: Finding[] = [];

  const hugeAssets = entries.filter((e) => isOkWithBody(e) && !isApiCall(e) && e.transferSize > ANY_LIMIT);
  if (hugeAssets.length > 0) {
    const biggest = hugeAssets.reduce((a, b) => (b.transferSize > a.transferSize ? b : a));
    findings.push({
      detector: 'large-payloads',
      severity: 'medium',
      title: `${hugeAssets.length} response${hugeAssets.length === 1 ? '' : 's'} over 1 MB on the wire`,
      explanation:
        `The largest is ${shortPath(biggest.path)} at ${formatBytes(biggest.transferSize)}. ` +
        `Payloads this size dominate load time on slow connections.`,
      remediation:
        'Resize and re-encode images (WebP/AVIF), code-split large bundles, and lazy-load anything ' +
        'not needed for first paint.',
      entries: hugeAssets.map((e) => e.index),
      wastedBytes: hugeAssets.reduce((acc, e) => acc + Math.max(0, e.transferSize - ANY_LIMIT), 0),
    });
  }

  const fatJson = entries.filter(
    (e) => isOkWithBody(e) && isApiCall(e) && e.mimeType.toLowerCase().includes('json') && e.bodySize > JSON_LIMIT,
  );
  if (fatJson.length > 0) {
    const biggest = fatJson.reduce((a, b) => (b.bodySize > a.bodySize ? b : a));
    findings.push({
      detector: 'large-json',
      severity: 'medium',
      title: `${fatJson.length} JSON response${fatJson.length === 1 ? '' : 's'} over ${formatBytes(JSON_LIMIT)}`,
      explanation:
        `API responses this large usually return an unpaginated collection or far more fields than ` +
        `the page renders. The largest is ${shortPath(biggest.path)} at ${formatBytes(biggest.bodySize)} decoded.`,
      remediation:
        'Paginate list endpoints (limit/cursor parameters) and trim the response to the fields the ' +
        'client actually uses (sparse fieldsets or a tailored view model).',
      entries: fatJson.map((e) => e.index),
    });
  }

  return findings;
}
