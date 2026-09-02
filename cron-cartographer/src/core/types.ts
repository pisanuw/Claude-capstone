/** A wall-clock time in some (implicit) time zone. Month and day are 1-based. */
export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

/** One item of a parsed cron field, kept for human-readable descriptions. */
export type CronFieldItem =
  | { kind: 'all'; step: number } // "*" or "*/step"
  | { kind: 'value'; value: number }
  | { kind: 'range'; from: number; to: number; step: number; wrapped: boolean };

export interface CronField {
  /** Sorted, de-duplicated concrete values the field matches. */
  values: number[];
  /** The syntactic items, for description generation. */
  items: CronFieldItem[];
  /** Vixie-cron rule: a field whose first item is "*" counts as unrestricted. */
  restricted: boolean;
}

export interface CronSchedule {
  kind: 'cron';
  /** Normalized five-field source expression. */
  source: string;
  minute: CronField; // 0-59
  hour: CronField; // 0-23
  dayOfMonth: CronField; // 1-31
  month: CronField; // 1-12
  dayOfWeek: CronField; // 0-6, 0 = Sunday (7 is normalized to 0)
}

export type RRuleFreq = 'MINUTELY' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RRuleByDay {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** e.g. 1 for 1MO (first Monday), -1 for -1FR (last Friday); 0 = every. */
  ordinal: number;
}

export interface RRuleSchedule {
  kind: 'rrule';
  source: string;
  freq: RRuleFreq;
  interval: number;
  byDay: RRuleByDay[];
  byMonthDay: number[];
  byMonth: number[];
  byHour: number[];
  byMinute: number[];
  count: number | null;
  /** Wall-clock cutoff (inclusive) in the schedule zone, or null. */
  until: WallTime | null;
}

export type Schedule = CronSchedule | RRuleSchedule;

/** One day cell of the heatmap, in the display zone. */
export interface DayCell {
  /** ISO date, e.g. "2026-09-02". */
  date: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  count: number;
  /** Up to TIMES_PER_DAY_CAP "HH:MM" fire times for the tooltip. */
  times: string[];
  /** How many further fire times were not stored. */
  more: number;
}

export interface Firing {
  utcMs: number;
  scheduleWall: WallTime;
  displayWall: WallTime;
}

export interface ExpandResult {
  days: DayCell[];
  totalFirings: number;
  daysWithFirings: number;
  maxPerDay: number;
  /** The first firings in order, capped for display. */
  next: Firing[];
  /** True if enumeration stopped at the safety cap before the horizon end. */
  truncated: boolean;
  /** Firings lost to a DST spring-forward gap in the schedule zone. */
  skippedInDstGap: number;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function wallToIsoDate(w: WallTime): string {
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

export function wallToHhMm(w: WallTime): string {
  return `${pad2(w.hour)}:${pad2(w.minute)}`;
}

/** Day of week (0 = Sunday) for a calendar date, via Zeller-free UTC trick. */
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
