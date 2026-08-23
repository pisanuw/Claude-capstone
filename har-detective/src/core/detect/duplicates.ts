/**
 * Duplicate fetches: the same GET URL downloaded more than once with a full
 * body in one session. In-memory request deduplication or standard caching
 * would make every copy after the first free.
 */

import type { Entry, Finding } from '../types';
import { formatBytes, shortPath } from '../format';
import { isOkWithBody } from './shared';

export function detectDuplicates(entries: Entry[]): Finding[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.method !== 'GET' || !isOkWithBody(e)) continue;
    const g = groups.get(e.url);
    if (g) g.push(e);
    else groups.set(e.url, [e]);
  }

  const findings: Finding[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const wasted = g.slice(1).reduce((acc, e) => acc + e.transferSize, 0);
    findings.push({
      detector: 'duplicate-requests',
      severity: g.length >= 4 || wasted > 200 * 1024 ? 'high' : 'medium',
      title: `${shortPath(g[0].path, 44)} downloaded ${g.length} times`,
      explanation:
        `The exact same URL returned a full ${formatBytes(g[0].transferSize)} body ${g.length} ` +
        `times, re-transferring ${formatBytes(wasted)} for content the client already had.`,
      remediation:
        'Deduplicate in the client (share one in-flight promise, or a data layer like React Query/SWR) ' +
        'and give the response an ETag or Cache-Control so repeats become 304s or cache hits.',
      entries: g.map((e) => e.index),
      wastedBytes: wasted,
    });
  }
  return findings;
}
