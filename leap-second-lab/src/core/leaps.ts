/**
 * Time scales around leap seconds.
 *
 * An instant is a number `tai`: SI seconds on the TAI scale, counted so that
 * `tai = posix(UTC label) + (TAI − UTC)`. That makes `formatPosix(tai)` the
 * TAI calendar reading (e.g. 2017-01-01T00:00:37 TAI when UTC reads midnight),
 * and differences between two `tai` values are true elapsed SI seconds.
 *
 * The model starts on 1972-01-01, when UTC was redefined with whole-second
 * steps and TAI − UTC was exactly 10 s. Earlier "rubber second" UTC is out of
 * scope.
 */

export interface LeapDay {
  /** The UTC date whose last minute is changed, YYYY-MM-DD. */
  date: string;
  /** +1 inserts 23:59:60, −1 removes 23:59:59. */
  sign: 1 | -1;
}

export interface LeapEntry extends LeapDay {
  /** POSIX seconds of 00:00:00 UTC on the day after `date`. */
  nextMidnight: number;
  /** TAI − UTC before the change. */
  before: number;
  /** TAI − UTC from 00:00:00 the next day. */
  after: number;
  /** `tai` at 00:00:00 UTC the next day. */
  taiAt: number;
}

export interface UtcLabel {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  /** Seconds including fraction; 60.x only inside an inserted leap second. */
  s: number;
}

/** TAI − UTC on 1972-01-01. */
export const BASE_OFFSET = 10;
/** GPS time = TAI − 19 s (fixed at the GPS epoch, 1980-01-06). */
export const GPS_MINUS_TAI = -19;
export const SECONDS_PER_WEEK = 604800;

/** The 27 positive leap seconds inserted 1972–2016 (IERS Bulletin C). */
export const HISTORICAL_LEAPS: readonly LeapDay[] = [
  '1972-06-30', '1972-12-31', '1973-12-31', '1974-12-31', '1975-12-31',
  '1976-12-31', '1977-12-31', '1978-12-31', '1979-12-31', '1981-06-30',
  '1982-06-30', '1983-06-30', '1985-06-30', '1987-12-31', '1989-12-31',
  '1990-12-31', '1992-06-30', '1993-06-30', '1994-06-30', '1995-12-31',
  '1997-06-30', '1998-12-31', '2005-12-31', '2008-12-31', '2012-06-30',
  '2015-06-30', '2016-12-31',
].map((date) => ({ date, sign: 1 as const }));

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(date: string): { y: number; mo: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Bad date "${date}", expected YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`No such date "${date}"`);
  }
  return { y, mo, d };
}

/** POSIX seconds of a label whose seconds are below 60. */
function posixOf(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0) / 1000 + s;
}

/** Build a sorted table with cumulative offsets. Duplicate dates are rejected. */
export function buildTable(leaps: readonly LeapDay[], base = BASE_OFFSET): LeapEntry[] {
  const sorted = [...leaps].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: LeapEntry[] = [];
  let offset = base;
  for (const leap of sorted) {
    const { y, mo, d } = parseDate(leap.date);
    if (out.length && out[out.length - 1].date === leap.date) {
      throw new Error(`Two leap seconds on ${leap.date}`);
    }
    const nextMidnight = posixOf(y, mo, d) + 86400;
    const before = offset;
    const after = offset + leap.sign;
    out.push({ ...leap, nextMidnight, before, after, taiAt: nextMidnight + after });
    offset = after;
  }
  return out;
}

export const HISTORICAL_TABLE: readonly LeapEntry[] = buildTable(HISTORICAL_LEAPS);

/** Table with one extra hypothetical leap appended (e.g. a negative one). */
export function withExtraLeap(extra: LeapDay, leaps: readonly LeapDay[] = HISTORICAL_LEAPS): LeapEntry[] {
  return buildTable([...leaps, extra]);
}

function dayKey(y: number, mo: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function findLeap(table: readonly LeapEntry[], date: string): LeapEntry | undefined {
  return table.find((e) => e.date === date);
}

const LABEL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\s*(Z|UTC|\+00:?00)?$/i;

/** Parse "YYYY-MM-DDThh:mm:ss[.fff][Z]" allowing seconds up to 60.999. */
export function parseLabel(text: string): UtcLabel {
  const m = LABEL_RE.exec(text.trim());
  if (!m) throw new Error(`Cannot read "${text}"; use YYYY-MM-DDThh:mm:ss[.fff]Z`);
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i]));
  const s = Number(m[6]);
  parseDate(dayKey(y, mo, d));
  if (h > 23 || mi > 59 || s >= 61) throw new Error(`Out-of-range time in "${text}"`);
  return { y, mo, d, h, mi, s };
}

export function formatLabel(l: UtcLabel, digits = 3): string {
  const whole = Math.floor(l.s);
  let frac = '';
  if (digits > 0) {
    const f = Math.round((l.s - whole) * 10 ** digits);
    frac = '.' + String(Math.min(f, 10 ** digits - 1)).padStart(digits, '0');
  }
  return `${dayKey(l.y, l.mo, l.d)}T${String(l.h).padStart(2, '0')}:${String(l.mi).padStart(2, '0')}:${String(whole).padStart(2, '0')}${frac}`;
}

/** Calendar label for a POSIX-style count (no leap seconds), e.g. a TAI or GPS reading. */
export function labelFromPosix(posix: number): UtcLabel {
  const whole = Math.floor(posix);
  const date = new Date(whole * 1000);
  return {
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds() + (posix - whole),
  };
}

export function formatPosix(posix: number, digits = 3): string {
  return formatLabel(labelFromPosix(posix), digits);
}

/** TAI − UTC in force at `tai` (the "before" value during an inserted second). */
export function offsetAt(tai: number, table: readonly LeapEntry[]): number {
  let offset = table.length ? table[0].before : BASE_OFFSET;
  for (const e of table) {
    if (tai >= e.taiAt) offset = e.after;
    else break;
  }
  return offset;
}

/** The inserted leap second containing `tai`, if any. */
export function insertedLeapAt(tai: number, table: readonly LeapEntry[]): LeapEntry | undefined {
  return table.find((e) => e.sign === 1 && tai >= e.nextMidnight + e.before && tai < e.taiAt);
}

/** Is this UTC label a real instant under `table`? Returns a reason when not. */
export function validateLabel(l: UtcLabel, table: readonly LeapEntry[]): string | null {
  const leap = findLeap(table, dayKey(l.y, l.mo, l.d));
  const lastMinute = l.h === 23 && l.mi === 59;
  if (l.s >= 60) {
    if (!leap || leap.sign !== 1 || !lastMinute) {
      return `${formatLabel(l, 0)} does not exist: no leap second was inserted at the end of ${dayKey(l.y, l.mo, l.d)}`;
    }
  }
  if (lastMinute && leap?.sign === -1 && l.s >= 59) {
    return `${formatLabel(l, 0)} does not exist: a negative leap second removes 23:59:59 on ${leap.date}`;
  }
  return null;
}

/** UTC label → tai. Throws for labels that never happened. */
export function labelToTai(l: UtcLabel, table: readonly LeapEntry[]): number {
  const reason = validateLabel(l, table);
  if (reason) throw new Error(reason);
  if (l.s >= 60) {
    const leap = findLeap(table, dayKey(l.y, l.mo, l.d)) as LeapEntry;
    return leap.nextMidnight + leap.before + (l.s - 60);
  }
  const posix = posixOf(l.y, l.mo, l.d, l.h, l.mi, l.s);
  // Labels on a leap day before midnight use the old offset; offsetAt keys on tai,
  // so look the offset up by the POSIX value against each entry's midnight.
  let offset = table.length ? table[0].before : BASE_OFFSET;
  for (const e of table) {
    if (posix >= e.nextMidnight) offset = e.after;
    else break;
  }
  return posix + offset;
}

export function parseToTai(text: string, table: readonly LeapEntry[] = HISTORICAL_TABLE): number {
  return labelToTai(parseLabel(text), table);
}

/** tai → UTC label, producing 23:59:60.x inside an inserted second. */
export function taiToLabel(tai: number, table: readonly LeapEntry[]): UtcLabel {
  const leap = insertedLeapAt(tai, table);
  if (leap) {
    const l = labelFromPosix(leap.nextMidnight - 1);
    return { ...l, s: 60 + (tai - (leap.nextMidnight + leap.before)) };
  }
  return labelFromPosix(tai - offsetAt(tai, table));
}

export function formatTai(tai: number, table: readonly LeapEntry[], digits = 3): string {
  return formatLabel(taiToLabel(tai, table), digits);
}

/**
 * The POSIX `time_t` a stepping kernel reports at `tai`. During an inserted
 * second it repeats the previous second (time goes backwards at its end);
 * across a removed second it jumps forward.
 */
export function posixStep(tai: number, table: readonly LeapEntry[]): number {
  const leap = insertedLeapAt(tai, table);
  if (leap) return leap.nextMidnight - 1 + (tai - (leap.nextMidnight + leap.before));
  return tai - offsetAt(tai, table);
}

export interface GpsTime {
  week: number;
  /** Seconds into the GPS week. */
  tow: number;
  /** GPS calendar reading (no leap seconds since 1980). */
  label: string;
}

/** tai of the GPS epoch, 1980-01-06T00:00:00 UTC (TAI − UTC was 19 s). */
export const GPS_EPOCH_TAI = posixOf(1980, 1, 6) + 19;

export function gpsFromTai(tai: number): GpsTime {
  const gps = tai - GPS_EPOCH_TAI;
  const week = Math.floor(gps / SECONDS_PER_WEEK);
  return { week, tow: gps - week * SECONDS_PER_WEEK, label: formatPosix(tai + GPS_MINUS_TAI) };
}

/** Elapsed SI seconds between two UTC labels. */
export function elapsedBetween(a: string, b: string, table: readonly LeapEntry[] = HISTORICAL_TABLE): number {
  return parseToTai(b, table) - parseToTai(a, table);
}

/** Number of leap seconds (net, signed) whose change happens in (taiA, taiB]. */
export function leapsBetween(taiA: number, taiB: number, table: readonly LeapEntry[]): number {
  return offsetAt(taiB, table) - offsetAt(taiA, table);
}
