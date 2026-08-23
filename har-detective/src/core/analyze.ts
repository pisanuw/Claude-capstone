/**
 * Run every detector over a parsed HAR, rank the findings, compute session
 * statistics, and write the deterministic plain-English narrative.
 */

import type { Analysis, Entry, Finding, OriginBreakdown, SessionStats, TypeBreakdown } from './types';
import { formatBytes, formatMs } from './format';
import { detectRepeatedCalls } from './detect/repeatedCalls';
import { detectMissingCacheHeaders } from './detect/caching';
import { detectUncompressed } from './detect/compression';
import { detectLargePayloads } from './detect/largePayloads';
import { detectRedirectChains } from './detect/redirects';
import { detectSequentialChains } from './detect/sequentialChains';
import { detectErrors } from './detect/errors';
import { detectSlowRequests } from './detect/slowRequests';
import { detectDuplicates } from './detect/duplicates';
import { detectProtocolOverhead } from './detect/protocol';

const DETECTORS: Array<(entries: Entry[]) => Finding[]> = [
  detectErrors,
  detectRepeatedCalls,
  detectSequentialChains,
  detectRedirectChains,
  detectMissingCacheHeaders,
  detectUncompressed,
  detectDuplicates,
  detectLargePayloads,
  detectSlowRequests,
  detectProtocolOverhead,
];

const SEVERITY_ORDER: Record<Finding['severity'], number> = { high: 0, medium: 1, low: 2 };

/** Rough single number for "how much does fixing this help", used only to order findings. */
function impact(f: Finding): number {
  // 1 KB on the wire is weighted like 1 ms of latency; both matter, neither dominates.
  return (f.wastedMs ?? 0) + (f.wastedBytes ?? 0) / 1024 + f.entries.length;
}

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return impact(b) - impact(a);
  });
}

export function sessionStats(entries: Entry[]): SessionStats {
  const byType = new Map<string, TypeBreakdown>();
  const byOrigin = new Map<string, OriginBreakdown>();
  let totalTransfer = 0;
  let totalDecoded = 0;
  let errorCount = 0;
  let cachedCount = 0;
  let end = 0;

  for (const e of entries) {
    totalTransfer += e.transferSize;
    totalDecoded += e.bodySize;
    if (e.status >= 400 || e.status === 0) errorCount++;
    if (e.fromCache || e.status === 304) cachedCount++;
    end = Math.max(end, e.start + e.time);

    const t = byType.get(e.type) ?? { type: e.type, count: 0, transferSize: 0 };
    t.count++;
    t.transferSize += e.transferSize;
    byType.set(e.type, t);

    const o = byOrigin.get(e.origin) ?? { origin: e.origin, count: 0, transferSize: 0 };
    o.count++;
    o.transferSize += e.transferSize;
    byOrigin.set(e.origin, o);
  }

  return {
    requestCount: entries.length,
    originCount: byOrigin.size,
    totalTransfer,
    totalDecoded,
    duration: end,
    errorCount,
    cachedCount,
    byType: [...byType.values()].sort((a, b) => b.transferSize - a.transferSize),
    topOrigins: [...byOrigin.values()].sort((a, b) => b.transferSize - a.transferSize).slice(0, 5),
  };
}

export function narrative(stats: SessionStats, findings: Finding[]): string {
  const parts: string[] = [];
  parts.push(
    `This session made ${stats.requestCount} requests to ${stats.originCount} ` +
      `origin${stats.originCount === 1 ? '' : 's'}, transferring ${formatBytes(stats.totalTransfer)} ` +
      `over ${formatMs(stats.duration)}.`,
  );
  if (stats.errorCount > 0) {
    parts.push(`${stats.errorCount} request${stats.errorCount === 1 ? '' : 's'} failed outright.`);
  }
  if (stats.cachedCount > 0) {
    parts.push(`${stats.cachedCount} came from cache or revalidated with a 304.`);
  }

  const high = findings.filter((f) => f.severity === 'high').length;
  if (findings.length === 0) {
    parts.push('No performance problems were detected — this is a clean session.');
  } else {
    parts.push(
      `${findings.length} issue${findings.length === 1 ? ' was' : 's were'} found` +
        (high > 0 ? `, ${high} of them high severity.` : '.'),
    );
    const top = findings[0];
    parts.push(`Biggest win: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}.`);
  }
  return parts.join(' ');
}

export function analyze(entries: Entry[]): Analysis {
  const findings = rankFindings(DETECTORS.flatMap((d) => d(entries)));
  const stats = sessionStats(entries);
  return { stats, findings, narrative: narrative(stats, findings) };
}
