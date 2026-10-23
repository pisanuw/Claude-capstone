// What a train's error means in time. With reduction R (input turns per output
// turn) as target and R' as built, the output hand turns R/R' times as fast as
// it should, so a clock built on it gains (R/R' - 1) of every interval.

import type { Train } from './search';

export const SECONDS_PER_DAY = 86400;

/** Fractional rate error of the output: positive means it runs fast. */
export function rateError(train: Pick<Train, 'error'>): number {
  return 1 / (1 + train.error) - 1;
}

export function secondsPerDay(train: Pick<Train, 'error'>): number {
  return rateError(train) * SECONDS_PER_DAY;
}

/** Days until the output has gained or lost `seconds`, or Infinity for an exact train. */
export function daysToDrift(train: Pick<Train, 'error'>, seconds: number): number {
  const spd = Math.abs(secondsPerDay(train));
  return spd === 0 ? Infinity : seconds / spd;
}

/** Turns the output is ahead (+) or behind (-) of an ideal hand after n ideal output turns. */
export function turnsAhead(train: Pick<Train, 'error'>, outputTurns: number): number {
  return outputTurns * rateError(train);
}

export function formatDuration(days: number): string {
  if (!Number.isFinite(days)) return 'never';
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} min`;
  if (days < 1) return `${(days * 24).toFixed(1)} h`;
  if (days < 365.25 * 2) return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
  const years = days / 365.25;
  if (years < 1e4) return `${years < 100 ? years.toFixed(1) : Math.round(years).toLocaleString('en-US')} years`;
  return `${years.toExponential(1)} years`;
}

export function formatError(error: number): string {
  if (error === 0) return 'exact';
  const a = Math.abs(error);
  const sign = error > 0 ? '+' : '−';
  if (a >= 1e-3) return `${sign}${(a * 100).toPrecision(3)}%`;
  if (a >= 1e-6) return `${sign}${(a * 1e6).toPrecision(3)} ppm`;
  return `${sign}${(a * 1e9).toPrecision(3)} ppb`;
}

export function formatSecondsPerDay(spd: number): string {
  if (spd === 0) return '0 s/day';
  const a = Math.abs(spd);
  const sign = spd > 0 ? 'gains ' : 'loses ';
  if (a >= 60) return `${sign}${(a / 60).toPrecision(3)} min/day`;
  if (a >= 0.01) return `${sign}${a.toPrecision(3)} s/day`;
  return `${sign}${(a * 1000).toPrecision(3)} ms/day`;
}
