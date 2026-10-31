/**
 * Clock models around one leap second. Each clock maps a true instant (`tai`)
 * to what a process would read. Readings are POSIX-style seconds, except the
 * monotonic clock, which counts SI seconds since an arbitrary boot instant.
 */
import { type LeapEntry, posixStep } from './leaps';

export type ClockKind = 'step' | 'smear24' | 'utcsls' | 'monotonic' | 'tai';

export interface ClockInfo {
  kind: ClockKind;
  name: string;
  short: string;
  description: string;
}

export const CLOCKS: readonly ClockInfo[] = [
  {
    kind: 'step',
    name: 'POSIX step',
    short: 'step',
    description:
      'A kernel following POSIX: every day has 86,400 seconds, so an inserted leap second replays the last second (the clock steps back 1 s) and a removed one is skipped (it jumps forward 1 s).',
  },
  {
    kind: 'smear24',
    name: '24-hour linear smear',
    short: 'smear',
    description:
      'Noon-to-noon linear smear, the scheme public NTP services from large cloud providers describe: for 24 hours every clock second is 1 ± 1/86,400 SI seconds, so the clock never steps but is up to 0.5 s off UTC at midnight.',
  },
  {
    kind: 'utcsls',
    name: 'UTC-SLS (1000 s)',
    short: 'sls',
    description:
      'Markus Kuhn\'s UTC-SLS proposal: smear only the last 1,000 seconds before midnight, ending exactly on UTC. Faster rate change (0.1%), shorter window.',
  },
  {
    kind: 'monotonic',
    name: 'Monotonic',
    short: 'mono',
    description:
      'CLOCK_MONOTONIC-style: SI seconds since boot. Never steps, ignores leap seconds, but is not a date; it only measures intervals on one machine.',
  },
  {
    kind: 'tai',
    name: 'TAI',
    short: 'tai',
    description:
      'International Atomic Time (CLOCK_TAI on Linux when the kernel knows the offset): continuous SI seconds, 37 s ahead of UTC since 2017.',
  },
];

export function clockInfo(kind: ClockKind): ClockInfo {
  return CLOCKS.find((c) => c.kind === kind) as ClockInfo;
}

export interface SmearWindow {
  /** POSIX reading where the smear starts. */
  posixStart: number;
  /** POSIX reading where the smear ends. */
  posixEnd: number;
  /** tai where the smear starts. */
  taiStart: number;
  /** tai where the smear ends. */
  taiEnd: number;
}

export function smearWindow(leap: LeapEntry, kind: 'smear24' | 'utcsls'): SmearWindow {
  const P = leap.nextMidnight;
  const posixStart = kind === 'smear24' ? P - 43200 : P - 1000;
  const posixEnd = kind === 'smear24' ? P + 43200 : P;
  return { posixStart, posixEnd, taiStart: posixStart + leap.before, taiEnd: posixEnd + leap.after };
}

/**
 * Read a clock at `tai`, relative to one leap second. `table` must contain
 * `leap`; it is used by the step clock. `bootTai` anchors the monotonic clock.
 */
export function readClock(
  kind: ClockKind,
  tai: number,
  leap: LeapEntry,
  table: readonly LeapEntry[],
  bootTai = leap.taiAt - 3600,
): number {
  switch (kind) {
    case 'step':
      return posixStep(tai, table);
    case 'smear24':
    case 'utcsls': {
      const w = smearWindow(leap, kind);
      if (tai <= w.taiStart) return tai - leap.before;
      if (tai >= w.taiEnd) return tai - leap.after;
      const f = (tai - w.taiStart) / (w.taiEnd - w.taiStart);
      return w.posixStart + f * (w.posixEnd - w.posixStart);
    }
    case 'monotonic':
      return tai - bootTai;
    case 'tai':
      return tai;
  }
}

/**
 * How far the clock reads from "UTC with the old offset", in seconds: 0 before
 * the leap for every POSIX-style clock, ending at −sign after it. The monotonic
 * and TAI clocks stay at 0 (they never apply the leap).
 */
export function clockDrift(kind: ClockKind, tai: number, leap: LeapEntry, table: readonly LeapEntry[]): number {
  if (kind === 'monotonic' || kind === 'tai') return 0;
  return readClock(kind, tai, leap, table) - (tai - leap.before);
}

/** Smeared clock rate relative to SI seconds, e.g. 0.99998843 for a 24 h positive smear. */
export function smearRate(leap: LeapEntry, kind: 'smear24' | 'utcsls'): number {
  const w = smearWindow(leap, kind);
  return (w.posixEnd - w.posixStart) / (w.taiEnd - w.taiStart);
}
