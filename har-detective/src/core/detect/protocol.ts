/**
 * HTTP/1.x connection churn: many requests to one origin over HTTP/1.x, each
 * paying its own DNS/TCP/TLS setup, points at a server without HTTP/2 or with
 * connection reuse broken.
 */

import type { Entry, Finding } from '../types';
import { formatMs } from '../format';
import { sumBy } from './shared';

const MIN_REQUESTS = 4;

function isHttp1(v: string): boolean {
  return v.startsWith('http/1');
}

export function detectProtocolOverhead(entries: Entry[]): Finding[] {
  const byOrigin = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!isHttp1(e.httpVersion)) continue;
    const g = byOrigin.get(e.origin);
    if (g) g.push(e);
    else byOrigin.set(e.origin, [e]);
  }

  const findings: Finding[] = [];
  for (const [origin, g] of byOrigin) {
    if (g.length < MIN_REQUESTS) continue;
    const setups = g.filter((e) => e.phases.connect > 0 || e.phases.dns > 0);
    const setupMs = sumBy(setups, (e) => e.phases.dns + e.phases.connect + e.phases.ssl);
    if (setups.length < 2) continue; // connections were reused; HTTP/1.1 alone is not worth flagging
    findings.push({
      detector: 'http1-connection-churn',
      severity: setups.length >= 4 || setupMs > 1000 ? 'high' : 'medium',
      title: `${origin} served ${g.length} requests over HTTP/1.x with ${setups.length} new connections`,
      explanation:
        `Each new connection pays DNS, TCP, and TLS setup again — ${formatMs(setupMs)} in this session. ` +
        `HTTP/1.x also caps parallelism at ~6 connections per origin, so requests queue.`,
      remediation:
        'Enable HTTP/2 (or HTTP/3) on this origin — one multiplexed connection carries all requests. ' +
        'On most CDNs and reverse proxies this is a single configuration switch.',
      entries: g.map((e) => e.index),
      wastedMs: setupMs,
    });
  }
  return findings;
}
