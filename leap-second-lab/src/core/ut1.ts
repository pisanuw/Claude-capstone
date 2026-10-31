/**
 * UT1 − UTC: a schematic history and a simple projection.
 *
 * History (1972 → cutover): UTC was kept within ±0.9 s of UT1 by leap seconds.
 * The curve drawn here is a SCHEMATIC sawtooth (UT1 − UTC falls from +0.5 s
 * just after each leap second to −0.5 s just before the next), not IERS
 * Bulletin data. It shows the mechanism, not the measured values.
 *
 * Projection (after the cutover, no more leap seconds): UT1 − UTC drifts by the
 * accumulated excess length of day (LOD). With an excess `e` ms/day that grows
 * by `trend` ms/day per century, after `t` years:
 *
 *   UT1 − UTC(t) = start − 365.25 · (e·t + trend·t² / 200) / 1000   seconds
 *
 * Both parameters are user inputs. Real LOD varies by milliseconds over years
 * and is not predictable decades ahead; the projection is a teaching model.
 */
import { HISTORICAL_TABLE, type LeapEntry } from './leaps';

export interface Ut1Model {
  /** Decimal year when leap seconds stop. */
  cutoverYear: number;
  /** UT1 − UTC at the cutover, seconds. */
  startValue: number;
  /** Mean excess length of day at the cutover, ms/day (positive: Earth slower than 86,400 s). */
  lodExcessMs: number;
  /** Change of the excess per century, ms/day per century. */
  trendMsPerCentury: number;
}

/** 20 May 2027, the start date given in the idea brief; adjustable in the UI. */
export const DEFAULT_CUTOVER = 2027 + (31 + 28 + 31 + 30 + 19) / 365; // 2027-05-20T00:00Z

export const DEFAULT_MODEL: Ut1Model = {
  cutoverYear: DEFAULT_CUTOVER,
  startValue: 0,
  lodExcessMs: 0.5,
  trendMsPerCentury: 1.7,
};

export function yearOfPosix(posix: number): number {
  const d = new Date(posix * 1000);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1) / 1000;
  const end = Date.UTC(y + 1, 0, 1) / 1000;
  return y + (posix - start) / (end - start);
}

/** Decimal year of each positive leap second in the table. */
export function leapYears(table: readonly LeapEntry[] = HISTORICAL_TABLE): number[] {
  return table.map((e) => yearOfPosix(e.nextMidnight));
}

/** Schematic UT1 − UTC before the cutover (see module comment). */
export function schematicHistory(year: number, table: readonly LeapEntry[] = HISTORICAL_TABLE): number {
  const ys = [1972, ...leapYears(table)];
  for (let i = ys.length - 1; i >= 0; i--) {
    if (year >= ys[i]) {
      const next = ys[i + 1];
      if (next === undefined) {
        // After the last leap second: keep falling at the last interval's rate,
        // floored at −0.5 s (it was −0.5 s before the next leap that never came).
        const span = ys[i] - ys[i - 1];
        return Math.max(-0.5, 0.5 - (year - ys[i]) / span);
      }
      return 0.5 - (year - ys[i]) / (next - ys[i]);
    }
  }
  return 0.5;
}

export function projection(model: Ut1Model, year: number): number {
  const t = year - model.cutoverYear;
  return model.startValue - (365.25 * (model.lodExcessMs * t + (model.trendMsPerCentury * t * t) / 200)) / 1000;
}

export function ut1MinusUtc(model: Ut1Model, year: number, table: readonly LeapEntry[] = HISTORICAL_TABLE): number {
  return year < model.cutoverYear ? schematicHistory(year, table) : projection(model, year);
}

/**
 * Years after the cutover until |UT1 − UTC| first reaches `limit` seconds, or
 * null if it never does within `horizon` years.
 */
export function yearsUntil(model: Ut1Model, limit: number, horizon = 10000): number | null {
  // Solve a·t² + b·t + c = ±limit for the smallest positive t.
  const a = (365.25 * model.trendMsPerCentury) / 200 / 1000;
  const b = (365.25 * model.lodExcessMs) / 1000;
  const roots: number[] = [];
  for (const target of [limit, -limit]) {
    // start − (a t² + b t) = target  →  a t² + b t + (target − start) = 0
    const c = target - model.startValue;
    if (Math.abs(a) < 1e-15) {
      if (Math.abs(b) > 1e-15) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const r = Math.sqrt(disc);
        roots.push((-b + r) / (2 * a), (-b - r) / (2 * a));
      }
    }
  }
  const valid = roots.filter((t) => t > 0 && t <= horizon).sort((x, y) => x - y);
  return valid.length ? valid[0] : null;
}

/** How many one-second leaps the old ±0.9 s rule would have needed by `year`. */
export function leapsAvoided(model: Ut1Model, year: number): number {
  if (year <= model.cutoverYear) return 0;
  const drift = projection(model, year) - model.startValue;
  return Math.trunc(Math.abs(drift) + 0.1) * Math.sign(-drift);
}
