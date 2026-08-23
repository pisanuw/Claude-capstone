/**
 * Failed requests: 4xx and 5xx responses grouped by status and endpoint, plus
 * requests that never got a response at all (status 0).
 */

import type { Entry, Finding } from '../types';
import { shortPath } from '../format';
import { pathTemplate } from './shared';

export function detectErrors(entries: Entry[]): Finding[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.status >= 400 || e.status === 0) {
      const key = `${e.status} ${e.method} ${e.origin}${pathTemplate(e.path)}`;
      const g = groups.get(key);
      if (g) g.push(e);
      else groups.set(key, [e]);
    }
  }

  const findings: Finding[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const label = first.status === 0 ? 'no response (aborted or blocked)' : `HTTP ${first.status} ${first.statusText}`.trim();
    findings.push({
      detector: 'failed-requests',
      severity: first.status >= 500 || first.status === 0 ? 'high' : 'medium',
      title: `${g.length === 1 ? 'Request fails' : `${g.length} requests fail`} with ${label}: ${shortPath(first.path, 40)}`,
      explanation:
        `${first.method} ${shortPath(first.path, 60)} on ${first.origin} returned ${label}` +
        (g.length > 1 ? ` ${g.length} times` : '') +
        `. Failed requests waste a round trip and often trigger retry loops or broken UI states.`,
      remediation:
        first.status >= 500 || first.status === 0
          ? 'Check the server logs for this endpoint; surface the failure to the user instead of retrying silently.'
          : 'Fix the request (auth token, URL, or payload) or stop issuing it; 4xx responses are client-side bugs.',
      entries: g.map((e) => e.index),
    });
  }
  return findings;
}
