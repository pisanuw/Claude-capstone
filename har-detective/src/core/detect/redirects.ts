/**
 * Redirect chains: each 3xx hop is a full round trip before the real resource
 * even starts. Chains are reconstructed by following Location targets to
 * later entries in the session.
 */

import type { Entry, Finding } from '../types';
import { formatMs, shortPath } from '../format';

function normalize(url: string): string {
  // Compare ignoring the fragment; Location values are already absolute in HARs
  // from browsers, but tolerate relative ones by returning them unchanged.
  return url.split('#')[0];
}

export function detectRedirectChains(entries: Entry[]): Finding[] {
  const redirects = entries.filter((e) => e.status >= 300 && e.status < 400 && e.redirectURL);
  if (redirects.length === 0) return [];

  // Map redirect target URL -> the redirect entry that produced it, so chains
  // A->B->C are walked from their head.
  const byUrl = new Map<string, Entry>();
  for (const e of redirects) byUrl.set(normalize(e.url), e);

  const isTarget = new Set<string>();
  for (const e of redirects) isTarget.add(normalize(e.redirectURL));

  const findings: Finding[] = [];
  for (const head of redirects) {
    if (isTarget.has(normalize(head.url))) continue; // not a chain head
    const chain: Entry[] = [head];
    let next = byUrl.get(normalize(head.redirectURL));
    while (next && chain.length < 10 && !chain.includes(next)) {
      chain.push(next);
      next = byUrl.get(normalize(next.redirectURL));
    }
    const wastedMs = chain.reduce((acc, e) => acc + e.time, 0);
    const hops = chain.map((e) => `${e.status} ${shortPath(e.path, 32)}`).join(' → ');
    const httpToHttps = chain.some(
      (e) => e.url.startsWith('http://') && e.redirectURL.startsWith('https://'),
    );
    findings.push({
      detector: 'redirect-chain',
      severity: chain.length >= 2 ? 'high' : 'low',
      title:
        chain.length >= 2
          ? `Redirect chain of ${chain.length} hops before ${shortPath(chain[chain.length - 1].redirectURL, 40)}`
          : `Redirect on ${shortPath(head.path, 40)}`,
      explanation:
        `${hops} — each hop is a full round trip (${formatMs(wastedMs)} total) before the real ` +
        `resource starts downloading.` +
        (httpToHttps ? ' One hop only upgrades http:// to https://.' : ''),
      remediation:
        (httpToHttps
          ? 'Send HSTS (`Strict-Transport-Security: max-age=31536000`) and always link with https:// to skip the upgrade hop. '
          : '') + 'Point links and bookmarks at the final URL, and collapse server-side redirects into one.',
      entries: chain.map((e) => e.index),
      wastedMs,
    });
  }
  return findings;
}
