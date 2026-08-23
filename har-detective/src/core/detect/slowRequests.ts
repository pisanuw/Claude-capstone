/**
 * Slow server responses: requests whose time-to-first-byte (the `wait` phase)
 * dominates. The network is not the problem there; the backend is.
 */

import type { Entry, Finding } from '../types';
import { formatMs, shortPath } from '../format';

const TTFB_LIMIT = 500;

export function detectSlowRequests(entries: Entry[]): Finding[] {
  const offenders = entries
    .filter((e) => e.phases.wait > TTFB_LIMIT && e.phases.wait > e.time * 0.5)
    .sort((a, b) => b.phases.wait - a.phases.wait)
    .slice(0, 10);
  if (offenders.length === 0) return [];

  const worst = offenders[0];
  return [
    {
      detector: 'slow-ttfb',
      severity: worst.phases.wait > 2000 ? 'high' : 'medium',
      title: `${offenders.length} request${offenders.length === 1 ? '' : 's'} with server think-time over ${formatMs(TTFB_LIMIT)}`,
      explanation:
        `The slowest, ${shortPath(worst.path, 48)}, spent ${formatMs(worst.phases.wait)} waiting ` +
        `for the first response byte — the server, not the network, is the bottleneck.`,
      remediation:
        'Profile these endpoints server-side: look for missing database indexes, N+1 queries in the ' +
        'backend, or synchronous calls to third-party services that belong in a cache or queue.',
      entries: offenders.map((e) => e.index),
      wastedMs: offenders.reduce((acc, e) => acc + Math.max(0, e.phases.wait - TTFB_LIMIT), 0),
    },
  ];
}
