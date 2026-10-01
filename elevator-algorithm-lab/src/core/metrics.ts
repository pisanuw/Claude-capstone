import type { Metrics, PassengerResult } from './types';

export interface MetricsExtras {
  energy: number;
  stops: number;
  /** Tick the run ended (last delivery, or maxTime when passengers were left). */
  endTime: number;
  maxTime: number;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Nearest-rank percentile (p in 0..100) of a list. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/**
 * Waits are measured until boarding; a passenger still waiting when the run
 * ends counts as having waited until maxTime, so starvation shows up in
 * maxWait rather than vanishing from the average.
 */
export function computeMetrics(passengers: PassengerResult[], x: MetricsExtras): Metrics {
  const waits: number[] = [];
  const rides: number[] = [];
  const totals: number[] = [];
  let served = 0;
  let unserved = 0;
  for (const p of passengers) {
    if (p.alightedAt !== null) {
      served++;
      waits.push((p.boardedAt as number) - p.t);
      rides.push(p.alightedAt - (p.boardedAt as number));
      totals.push(p.alightedAt - p.t);
    } else {
      unserved++;
      waits.push(p.boardedAt !== null ? p.boardedAt - p.t : x.maxTime - p.t);
    }
  }
  return {
    served,
    unserved,
    meanWait: mean(waits),
    p95Wait: percentile(waits, 95),
    maxWait: waits.length ? Math.max(...waits) : 0,
    meanRide: mean(rides),
    meanTotal: mean(totals),
    energy: x.energy,
    finishTime: x.endTime,
    stops: x.stops,
  };
}

export interface MetricColumn {
  key: keyof Metrics;
  label: string;
  /** Unit shown after the value. */
  unit: string;
  /** Whether a smaller value is better (served is the exception). */
  lowerIsBetter: boolean;
  /** Label used when the scenario is a disk trace. */
  diskLabel?: string;
}

export const METRIC_COLUMNS: MetricColumn[] = [
  { key: 'meanWait', label: 'Mean wait', unit: 'ticks', lowerIsBetter: true, diskLabel: 'Mean response' },
  { key: 'p95Wait', label: 'p95 wait', unit: 'ticks', lowerIsBetter: true, diskLabel: 'p95 response' },
  { key: 'maxWait', label: 'Max wait (starvation)', unit: 'ticks', lowerIsBetter: true, diskLabel: 'Max response' },
  { key: 'meanRide', label: 'Mean ride', unit: 'ticks', lowerIsBetter: true },
  { key: 'energy', label: 'Energy', unit: 'floors', lowerIsBetter: true, diskLabel: 'Head movement' },
  { key: 'finishTime', label: 'Finish time', unit: 'ticks', lowerIsBetter: true },
  { key: 'stops', label: 'Stops', unit: '', lowerIsBetter: true },
  { key: 'served', label: 'Served', unit: '', lowerIsBetter: false },
  { key: 'unserved', label: 'Unserved', unit: '', lowerIsBetter: true },
];

export function formatMetric(key: keyof Metrics, value: number): string {
  if (key === 'served' || key === 'unserved' || key === 'stops' || key === 'energy' || key === 'finishTime' || key === 'maxWait' || key === 'p95Wait') {
    return String(Math.round(value));
  }
  return value.toFixed(1);
}
