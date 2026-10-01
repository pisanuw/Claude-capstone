import type { Metrics } from './types';

/**
 * A class leaderboard that stores only scores and policy hashes, never code.
 * The board lives in the student's browser (localStorage) and travels as a
 * JSON or CSV export; there is no server.
 */
export interface LeaderboardEntry {
  name: string;
  scenarioId: string;
  policyHash: string;
  policyName: string;
  metrics: Metrics;
  /** ISO date of the run. */
  at: string;
}

export const LEADERBOARD_KEY = 'elevator-lab-leaderboard-v1';

/** Lower is better: mean wait, with the starvation tail counted at a quarter weight. */
export function score(m: Metrics): number {
  const penalty = m.unserved * 1000;
  return m.meanWait + 0.25 * m.maxWait + penalty;
}

/** Add an entry, replacing any older run of the same policy on the same scenario. */
export function addEntry(list: LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  const rest = list.filter(
    (e) => !(e.scenarioId === entry.scenarioId && e.policyHash === entry.policyHash && e.name === entry.name),
  );
  return [...rest, entry];
}

/** Entries for one scenario, best first; ties keep the earlier run ahead. */
export function rank(list: LeaderboardEntry[], scenarioId: string): LeaderboardEntry[] {
  return list
    .filter((e) => e.scenarioId === scenarioId)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => score(a.e.metrics) - score(b.e.metrics) || a.i - b.i)
    .map((x) => x.e);
}

function csvCell(v: unknown): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS: (keyof Metrics)[] = [
  'meanWait',
  'p95Wait',
  'maxWait',
  'meanRide',
  'energy',
  'finishTime',
  'stops',
  'served',
  'unserved',
];

export function toCsv(list: LeaderboardEntry[]): string {
  const header = ['name', 'scenario', 'policy', 'policyHash', 'score', ...CSV_COLUMNS, 'at'];
  const rows = list.map((e) => [
    e.name,
    e.scenarioId,
    e.policyName,
    e.policyHash,
    score(e.metrics).toFixed(2),
    ...CSV_COLUMNS.map((k) => (Number.isInteger(e.metrics[k]) ? e.metrics[k] : e.metrics[k].toFixed(2))),
    e.at,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Parse a saved board; anything malformed yields an empty list. */
export function parseBoard(text: string | null): LeaderboardEntry[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (e): e is LeaderboardEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as LeaderboardEntry).name === 'string' &&
        typeof (e as LeaderboardEntry).scenarioId === 'string' &&
        typeof (e as LeaderboardEntry).policyHash === 'string' &&
        typeof (e as LeaderboardEntry).metrics === 'object',
    );
  } catch {
    return [];
  }
}

/** Merge an imported board (another student's export) into ours. */
export function mergeBoards(ours: LeaderboardEntry[], theirs: LeaderboardEntry[]): LeaderboardEntry[] {
  let out = ours;
  for (const e of theirs) out = addEntry(out, e);
  return out;
}
