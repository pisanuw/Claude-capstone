/**
 * N+1 detection: many API calls hitting the same endpoint template in one
 * session almost always means a per-item fetch loop that a batch endpoint,
 * an `include` parameter, or a join would collapse into one request.
 */

import type { Entry, Finding } from '../types';
import { formatMs } from '../format';
import { isApiCall, pathTemplate, sumBy } from './shared';

const MIN_CALLS = 3;

export function detectRepeatedCalls(entries: Entry[]): Finding[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!isApiCall(e)) continue;
    const key = `${e.method} ${e.origin}${pathTemplate(e.path)}`;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }

  const findings: Finding[] = [];
  for (const [key, g] of groups) {
    if (g.length < MIN_CALLS) continue;
    // Distinct concrete paths separate true N+1 loops (/items/1, /items/2, …)
    // from plain duplicate fetches of one URL, reported by another detector.
    const distinctPaths = new Set(g.map((e) => e.path));
    if (distinctPaths.size < MIN_CALLS) continue;

    const totalMs = sumBy(g, (e) => e.time);
    const slowest = Math.max(...g.map((e) => e.time));
    findings.push({
      detector: 'repeated-calls',
      severity: g.length >= 6 ? 'high' : 'medium',
      title: `N+1 pattern: ${g.length} calls to ${key}`,
      explanation:
        `${g.length} separate requests hit the same endpoint shape with different ids, ` +
        `spending ${formatMs(totalMs)} of combined request time. This is the classic N+1 ` +
        `pattern: the client fetches a list, then loops fetching each item.`,
      remediation:
        'Add a batch endpoint (e.g. GET …?ids=1,2,3), expand the list response to embed the ' +
        'per-item data, or use an include/expand query parameter so one request replaces all ' +
        `${g.length}.`,
      entries: g.map((e) => e.index),
      wastedMs: Math.max(0, totalMs - slowest),
    });
  }
  return findings;
}
