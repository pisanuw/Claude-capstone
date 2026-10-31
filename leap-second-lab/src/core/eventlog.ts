/**
 * Replay a two-host event log across a leap second. Host A sends requests to
 * host B; each host stamps its log lines with its own clock. Merging the logs
 * by timestamp then shows reordered lines, effects before causes, repeated
 * stamps and negative durations.
 */
import { type ClockKind, readClock } from './clocks';
import type { LeapEntry } from './leaps';

export interface LogConfig {
  clockA: ClockKind;
  clockB: ClockKind;
  /** Seconds of true time before and after the leap to simulate. */
  spanSeconds: number;
  /** Mean gap between requests in milliseconds. */
  meanGapMs: number;
  /** One-way network latency in milliseconds. */
  latencyMs: number;
  /** Time B spends handling a request, in milliseconds. */
  serviceMs: number;
  /** Timestamp resolution in milliseconds (1 = ms stamps). */
  resolutionMs: number;
  seed: number;
}

export type EventKind = 'send' | 'recv' | 'reply' | 'done';

export interface LogEvent {
  /** Position in true order (0-based). */
  trueIndex: number;
  host: 'A' | 'B';
  kind: EventKind;
  request: number;
  tai: number;
  /** Clock reading, rounded down to the resolution. */
  stamp: number;
}

export interface Anomaly {
  kind: 'causality' | 'backwards' | 'duplicate' | 'negative-rtt';
  request: number;
  text: string;
}

export interface LogReport {
  events: LogEvent[];
  /** Events sorted by stamp (stable on true order for ties). */
  merged: LogEvent[];
  /** Pairs of events whose merged order disagrees with true order. */
  inversions: number;
  anomalies: Anomaly[];
  /** Requests whose round trip measured by A is wrong by more than 1 ms. */
  badRtt: number;
  requests: number;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantize(x: number, resolutionMs: number): number {
  const r = resolutionMs / 1000;
  return Math.floor(x / r + 1e-9) * r;
}

export function simulateLog(cfg: LogConfig, leap: LeapEntry, table: readonly LeapEntry[]): LogReport {
  const rand = rng(cfg.seed);
  const centre = leap.nextMidnight + leap.before; // tai where the leap begins
  const start = centre - cfg.spanSeconds;
  const end = centre + cfg.spanSeconds;
  const lat = cfg.latencyMs / 1000;
  const svc = cfg.serviceMs / 1000;
  const raw: Omit<LogEvent, 'trueIndex' | 'stamp'>[] = [];
  let t = start;
  let req = 0;
  while (t < end && req < 2000) {
    raw.push({ host: 'A', kind: 'send', request: req, tai: t });
    raw.push({ host: 'B', kind: 'recv', request: req, tai: t + lat });
    raw.push({ host: 'B', kind: 'reply', request: req, tai: t + lat + svc });
    raw.push({ host: 'A', kind: 'done', request: req, tai: t + 2 * lat + svc });
    req += 1;
    // Exponential gaps with a 1 ms floor keep the stream bursty but ordered.
    t += Math.max(0.001, (-Math.log(1 - rand()) * cfg.meanGapMs) / 1000);
  }
  raw.sort((a, b) => a.tai - b.tai);
  const events: LogEvent[] = raw.map((e, i) => ({
    ...e,
    trueIndex: i,
    stamp: quantize(readClock(e.host === 'A' ? cfg.clockA : cfg.clockB, e.tai, leap, table, start - 60), cfg.resolutionMs),
  }));
  const merged = [...events].sort((a, b) => a.stamp - b.stamp || a.trueIndex - b.trueIndex);

  // Count inversions with a merge sort over trueIndex in merged order.
  const inversions = countInversions(merged.map((e) => e.trueIndex));

  const anomalies: Anomaly[] = [];
  const byReq = new Map<number, Partial<Record<EventKind, LogEvent>>>();
  for (const e of events) {
    const slot = byReq.get(e.request) ?? {};
    slot[e.kind] = e;
    byReq.set(e.request, slot);
  }
  let badRtt = 0;
  for (const [r, s] of byReq) {
    const send = s.send as LogEvent;
    const recv = s.recv as LogEvent;
    const done = s.done as LogEvent;
    if (recv.stamp < send.stamp) {
      anomalies.push({ kind: 'causality', request: r, text: `B logged receiving #${r} ${ms(send.stamp - recv.stamp)} before A logged sending it` });
    }
    const rtt = done.stamp - send.stamp;
    const trueRtt = done.tai - send.tai;
    if (Math.abs(rtt - trueRtt) > 0.001 + cfg.resolutionMs / 1000) {
      badRtt += 1;
      if (rtt < 0) anomalies.push({ kind: 'negative-rtt', request: r, text: `A measured a round trip of ${ms(rtt)} for #${r} (true ${ms(trueRtt)})` });
    }
  }
  for (const host of ['A', 'B'] as const) {
    const own = events.filter((e) => e.host === host);
    for (let i = 1; i < own.length; i++) {
      const prev = own[i - 1];
      const cur = own[i];
      if (cur.stamp < prev.stamp) {
        anomalies.push({ kind: 'backwards', request: cur.request, text: `Host ${host}'s clock went back ${ms(prev.stamp - cur.stamp)} between consecutive lines (#${prev.request} ${prev.kind} → #${cur.request} ${cur.kind})` });
      }
    }
  }
  const seen = new Map<string, LogEvent>();
  for (const e of events) {
    const key = `${e.host}:${e.stamp.toFixed(6)}`;
    const other = seen.get(key);
    // Same stamp on one host although more than one tick of real time apart.
    if (other && e.tai - other.tai > cfg.resolutionMs / 1000 + 1e-6) {
      anomalies.push({ kind: 'duplicate', request: e.request, text: `Host ${e.host} stamped #${other.request} ${other.kind} and #${e.request} ${e.kind} identically although they are ${ms(e.tai - other.tai)} apart` });
    }
    if (!other) seen.set(key, e);
  }
  return { events, merged, inversions, anomalies, badRtt, requests: req };
}

export function countInversions(xs: number[]): number {
  const a = [...xs];
  const tmp = new Array<number>(a.length);
  let count = 0;
  for (let width = 1; width < a.length; width *= 2) {
    for (let lo = 0; lo < a.length; lo += 2 * width) {
      const mid = Math.min(lo + width, a.length);
      const hi = Math.min(lo + 2 * width, a.length);
      let i = lo;
      let j = mid;
      let k = lo;
      while (i < mid && j < hi) {
        if (a[i] <= a[j]) tmp[k++] = a[i++];
        else {
          count += mid - i;
          tmp[k++] = a[j++];
        }
      }
      while (i < mid) tmp[k++] = a[i++];
      while (j < hi) tmp[k++] = a[j++];
      for (let m = lo; m < hi; m++) a[m] = tmp[m];
    }
  }
  return count;
}

export function ms(seconds: number): string {
  const v = seconds * 1000;
  return `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} ms`;
}
