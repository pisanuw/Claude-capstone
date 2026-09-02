import type { DayCell, ExpandResult, Firing, Schedule, WallTime } from './types.js';
import { wallToHhMm, wallToIsoDate, weekdayOf } from './types.js';
import {
  buildOffsetTable,
  naiveUtcMsToWall,
  offsetAt,
  utcMsToWall,
  wallToNaiveUtcMs,
  wallToUtcMs,
  type OffsetTable,
} from './tz.js';
import { matchesDay } from './cron.js';
import { expandRRule } from './rrule.js';

/** Enumerate a schedule's firings and aggregate them for the heatmap. */

export const FIRING_CAP = 600_000; // above a year of every-minute firings
export const TIMES_PER_DAY_CAP = 24;
export const NEXT_LIST_CAP = 25;

const MS_PER_DAY = 24 * 3600 * 1000;

export interface ExpandOptions {
  scheduleZone: string;
  displayZone: string;
  /** Any positive day count works; the UI offers 30, 90, and 365. */
  horizonDays: number;
  /** Enumeration starts at this instant (defaults to now). */
  startMs?: number;
}

interface Enumerated {
  utcMs: number[];
  scheduleWalls: WallTime[];
  skippedInDstGap: number;
  truncated: boolean;
}

function enumerateCron(
  schedule: Schedule & { kind: 'cron' },
  table: OffsetTable,
  startMs: number,
  horizonDays: number,
): Enumerated {
  const utcMs: number[] = [];
  const scheduleWalls: WallTime[] = [];
  let skipped = 0;
  let truncated = false;
  const startWall = utcMsToWall(table, startMs);
  const endMs = startMs + horizonDays * MS_PER_DAY;
  const firstDayMs = wallToNaiveUtcMs({ ...startWall, hour: 0, minute: 0 });
  // Iterate wall-clock days in the schedule zone; extra trailing days cover
  // the case where the zone runs behind the horizon-end instant.
  outer: for (let dayIndex = 0; dayIndex <= horizonDays + 1; dayIndex++) {
    const dayWall = naiveUtcMsToWall(firstDayMs + dayIndex * MS_PER_DAY);
    if (!matchesDay(schedule, dayWall.year, dayWall.month, dayWall.day)) continue;
    for (const hour of schedule.hour.values) {
      for (const minute of schedule.minute.values) {
        const wall: WallTime = { ...dayWall, hour, minute };
        const ms = wallToUtcMs(table, wall);
        if (ms === null) {
          skipped++; // the DST spring-forward gap: system cron skips these too
          continue;
        }
        if (ms < startMs || ms >= endMs) continue;
        if (utcMs.length >= FIRING_CAP) {
          truncated = true;
          break outer;
        }
        utcMs.push(ms);
        scheduleWalls.push(wall);
      }
    }
  }
  return { utcMs, scheduleWalls, skippedInDstGap: skipped, truncated };
}

function enumerateRRule(
  schedule: Schedule & { kind: 'rrule' },
  table: OffsetTable,
  startMs: number,
  horizonDays: number,
): Enumerated {
  const startWall = utcMsToWall(table, startMs);
  const walls = expandRRule(schedule, startWall, horizonDays + 2);
  const endMs = startMs + horizonDays * MS_PER_DAY;
  const utcMs: number[] = [];
  const scheduleWalls: WallTime[] = [];
  let skipped = 0;
  let truncated = false;
  for (const wall of walls) {
    const ms = wallToUtcMs(table, wall);
    if (ms === null) {
      skipped++;
      continue;
    }
    if (ms < startMs || ms >= endMs) continue;
    if (utcMs.length >= FIRING_CAP) {
      truncated = true;
      break;
    }
    utcMs.push(ms);
    scheduleWalls.push(wall);
  }
  return { utcMs, scheduleWalls, skippedInDstGap: skipped, truncated };
}

/** Expand a schedule over the horizon and aggregate per display-zone day. */
export function expandSchedule(schedule: Schedule, opts: ExpandOptions): ExpandResult {
  const startMs = Math.floor((opts.startMs ?? Date.now()) / 60000) * 60000;
  const endMs = startMs + opts.horizonDays * MS_PER_DAY;
  const pad = 2 * MS_PER_DAY;
  const scheduleTable = buildOffsetTable(opts.scheduleZone, startMs - pad, endMs + pad);
  const displayTable =
    opts.displayZone === opts.scheduleZone
      ? scheduleTable
      : buildOffsetTable(opts.displayZone, startMs - pad, endMs + pad);

  const enumerated =
    schedule.kind === 'cron'
      ? enumerateCron(schedule, scheduleTable, startMs, opts.horizonDays)
      : enumerateRRule(schedule, scheduleTable, startMs, opts.horizonDays);

  // Pre-fill a cell for every display-zone calendar day in the horizon so
  // the heatmap shows zero-firing days too.
  const cells = new Map<string, DayCell>();
  const order: string[] = [];
  const firstDisplayWall = utcMsToWall(displayTable, startMs);
  const firstDisplayDayMs = wallToNaiveUtcMs({ ...firstDisplayWall, hour: 0, minute: 0 });
  const lastDisplayWall = utcMsToWall(displayTable, endMs - 60000);
  const lastDisplayDayMs = wallToNaiveUtcMs({ ...lastDisplayWall, hour: 0, minute: 0 });
  for (let ms = firstDisplayDayMs; ms <= lastDisplayDayMs; ms += MS_PER_DAY) {
    const w = naiveUtcMsToWall(ms);
    const date = wallToIsoDate(w);
    cells.set(date, {
      date,
      weekday: weekdayOf(w.year, w.month, w.day),
      count: 0,
      times: [],
      more: 0,
    });
    order.push(date);
  }

  let total = 0;
  const next: Firing[] = [];
  for (let i = 0; i < enumerated.utcMs.length; i++) {
    const ms = enumerated.utcMs[i];
    const displayWall = naiveUtcMsToWall(ms + offsetAt(displayTable, ms) * 60000);
    const date = wallToIsoDate(displayWall);
    const cell = cells.get(date);
    if (cell) {
      cell.count++;
      if (cell.times.length < TIMES_PER_DAY_CAP) cell.times.push(wallToHhMm(displayWall));
      else cell.more++;
    }
    total++;
    if (next.length < NEXT_LIST_CAP) {
      next.push({ utcMs: ms, scheduleWall: enumerated.scheduleWalls[i], displayWall });
    }
  }

  const days = order.map((date) => cells.get(date) as DayCell);
  let daysWithFirings = 0;
  let maxPerDay = 0;
  for (const day of days) {
    if (day.count > 0) daysWithFirings++;
    if (day.count > maxPerDay) maxPerDay = day.count;
  }
  return {
    days,
    totalFirings: total,
    daysWithFirings,
    maxPerDay,
    next,
    truncated: enumerated.truncated,
    skippedInDstGap: enumerated.skippedInDstGap,
  };
}
