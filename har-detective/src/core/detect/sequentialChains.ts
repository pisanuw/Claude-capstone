/**
 * Serialized API waterfalls: consecutive API calls where each one starts
 * right after the previous finishes. Unless each request needs the previous
 * response, these could run in parallel and finish in the time of the slowest.
 */

import type { Entry, Finding } from '../types';
import { formatMs, shortPath } from '../format';
import { isApiCall } from './shared';

const MAX_GAP_MS = 120; // "starts right after" tolerance
const MIN_CHAIN = 3;

export function detectSequentialChains(entries: Entry[]): Finding[] {
  const api = entries.filter(isApiCall).sort((a, b) => a.start - b.start);
  const findings: Finding[] = [];
  let chain: Entry[] = [];

  const flush = () => {
    if (chain.length >= MIN_CHAIN) {
      const first = chain[0];
      const last = chain[chain.length - 1];
      const elapsed = last.start + last.time - first.start;
      const slowest = Math.max(...chain.map((e) => e.time));
      const wastedMs = Math.max(0, elapsed - slowest);
      findings.push({
        detector: 'sequential-chain',
        severity: wastedMs > 1000 ? 'high' : 'medium',
        title: `${chain.length} API calls run one after another`,
        explanation:
          `${chain.map((e) => shortPath(e.path, 28)).join(' → ')} execute strictly in sequence, ` +
          `taking ${formatMs(elapsed)} end to end. Run in parallel they would finish in about ` +
          `${formatMs(slowest)}.`,
        remediation:
          'If the calls are independent, issue them together (`Promise.all([...])`). If each needs ' +
          'the previous response, add a combined endpoint that returns everything in one round trip.',
        entries: chain.map((e) => e.index),
        wastedMs,
      });
    }
    chain = [];
  };

  for (const e of api) {
    if (chain.length === 0) {
      chain.push(e);
      continue;
    }
    const prev = chain[chain.length - 1];
    const prevEnd = prev.start + prev.time;
    const gap = e.start - prevEnd;
    if (gap >= -10 && gap <= MAX_GAP_MS) {
      chain.push(e);
    } else {
      flush();
      chain.push(e);
    }
  }
  flush();
  return findings;
}
