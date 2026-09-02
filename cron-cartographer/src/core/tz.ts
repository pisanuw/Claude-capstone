import type { WallTime } from './types.js';

/**
 * Exact, fast time-zone math on top of the built-in Intl database.
 *
 * Probing an offset through Intl.DateTimeFormat costs microseconds, which is
 * far too slow to do once per firing when a cron like "* * * * *" produces
 * half a million of them. Instead we build, once per zone and horizon, a
 * table of the zone's UTC-offset transitions (exact to the minute), and then
 * every conversion is pure arithmetic plus a binary search.
 */

export interface OffsetTable {
  zone: string;
  /** Transition start instants (ms), ascending; entries[i] applies from startMs[i]. */
  startMs: number[];
  /** UTC offset in minutes east of UTC applying from the matching startMs. */
  offsetMin: number[];
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(zone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(zone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(zone, dtf);
  }
  return dtf;
}

/** True if the identifier names a zone the runtime's Intl database knows. */
export function isValidZone(zone: string): boolean {
  try {
    getDtf(zone);
    return true;
  } catch {
    return false;
  }
}

/** Probe the zone's UTC offset (minutes) at one instant via Intl. */
export function probeOffset(zone: string, utcMs: number): number {
  const parts = getDtf(zone).formatToParts(utcMs);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  const msFloor = utcMs - (((utcMs % 1000) + 1000) % 1000);
  return Math.round((asIfUtc - msFloor) / 60000);
}

const PROBE_STEP_MS = 12 * 3600 * 1000;

/**
 * Build the offset-transition table for [fromMs, toMs]. Samples every 12
 * hours and binary-searches each change down to the exact minute, so the
 * table is exact for any real-world zone (no zone shifts twice in 12 hours).
 */
export function buildOffsetTable(zone: string, fromMs: number, toMs: number): OffsetTable {
  const startMs: number[] = [fromMs];
  const offsetMin: number[] = [probeOffset(zone, fromMs)];
  let prevMs = fromMs;
  let prevOff = offsetMin[0];
  for (let t = fromMs + PROBE_STEP_MS; t < toMs + PROBE_STEP_MS; t += PROBE_STEP_MS) {
    const off = probeOffset(zone, t);
    if (off !== prevOff) {
      // Binary search the exact transition minute in (prevMs, t].
      let lo = prevMs;
      let hi = t;
      while (hi - lo > 60000) {
        const mid = lo + Math.floor((hi - lo) / 2 / 60000) * 60000;
        if (probeOffset(zone, mid) === prevOff) lo = mid;
        else hi = mid;
      }
      startMs.push(hi);
      offsetMin.push(off);
    }
    prevMs = t;
    prevOff = off;
  }
  return { zone, startMs, offsetMin };
}

/** UTC offset (minutes) at an instant, from the table. */
export function offsetAt(table: OffsetTable, utcMs: number): number {
  const { startMs, offsetMin } = table;
  let lo = 0;
  let hi = startMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (startMs[mid] <= utcMs) lo = mid;
    else hi = mid - 1;
  }
  return offsetMin[lo];
}

export function wallToNaiveUtcMs(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
}

export function naiveUtcMsToWall(ms: number): WallTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Convert an instant to the zone's wall time using the table. */
export function utcMsToWall(table: OffsetTable, utcMs: number): WallTime {
  return naiveUtcMsToWall(utcMs + offsetAt(table, utcMs) * 60000);
}

/**
 * Convert a wall time in the table's zone to an instant.
 *
 * Returns null for wall times that do not exist (the DST spring-forward
 * gap); an ambiguous wall time (fall-back overlap) resolves to the earlier
 * instant, matching what system crons do: the job still runs once.
 */
export function wallToUtcMs(table: OffsetTable, w: WallTime): number | null {
  const naive = wallToNaiveUtcMs(w);
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (const off of table.offsetMin) {
    if (seen.has(off)) continue;
    seen.add(off);
    const candidate = naive - off * 60000;
    if (offsetAt(table, candidate) === off) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/** All IANA zone names the runtime knows, with a small fallback list. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === 'function') {
    const zones = intl.supportedValuesOf('timeZone');
    return zones.includes('UTC') ? zones : ['UTC', ...zones];
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];
}

/** The browser's (or process's) current zone, defaulting to UTC. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
