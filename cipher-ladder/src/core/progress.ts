/**
 * Student progress: which rung is unlocked, time spent, hints taken, tools
 * opened. Pure data and pure functions; the page keeps it in localStorage
 * and can export it as JSON for the instructor dashboard, which reads any
 * number of such exports. This replaces the idea's Supabase roster.
 */
import type { StudentKey } from './ciphers.js';

export type ToolName = 'frequency' | 'bigrams' | 'period' | 'symbols' | 'notes';

export interface RungProgress {
  status: 'locked' | 'open' | 'solved';
  /** Epoch ms of first open; undefined while locked. */
  startedAt?: number;
  solvedAt?: number;
  hintsUsed: number;
  /** Failed "check" presses. */
  attempts: number;
  toolsUsed: ToolName[];
  key?: StudentKey;
  /** Free-text scratchpad the student keeps on the rung. */
  notes?: string;
}

export interface Progress {
  version: 1;
  ladderId: string;
  ladderTitle: string;
  student: string;
  rungs: RungProgress[];
}

export function newProgress(ladderId: string, ladderTitle: string, rungCount: number, student = ''): Progress {
  const rungs: RungProgress[] = [];
  for (let i = 0; i < rungCount; i++) {
    rungs.push({ status: i === 0 ? 'open' : 'locked', hintsUsed: 0, attempts: 0, toolsUsed: [] });
  }
  if (rungs[0]) rungs[0].startedAt = Date.now();
  return { version: 1, ladderId, ladderTitle, student, rungs };
}

/** Validates a parsed JSON value as a Progress record; null if it is not one. */
export function parseProgress(input: unknown): Progress | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ladderId !== 'string' || !Array.isArray(o.rungs)) return null;
  const rungs: RungProgress[] = [];
  for (const r of o.rungs as unknown[]) {
    if (!r || typeof r !== 'object') return null;
    const d = r as Record<string, unknown>;
    if (d.status !== 'locked' && d.status !== 'open' && d.status !== 'solved') return null;
    rungs.push({
      status: d.status,
      startedAt: typeof d.startedAt === 'number' ? d.startedAt : undefined,
      solvedAt: typeof d.solvedAt === 'number' ? d.solvedAt : undefined,
      hintsUsed: typeof d.hintsUsed === 'number' ? d.hintsUsed : 0,
      attempts: typeof d.attempts === 'number' ? d.attempts : 0,
      toolsUsed: Array.isArray(d.toolsUsed) ? (d.toolsUsed.filter((t) => typeof t === 'string') as ToolName[]) : [],
      key: d.key && typeof d.key === 'object' ? (d.key as StudentKey) : undefined,
      notes: typeof d.notes === 'string' ? d.notes : undefined,
    });
  }
  return {
    version: 1,
    ladderId: o.ladderId,
    ladderTitle: typeof o.ladderTitle === 'string' ? o.ladderTitle : '',
    student: typeof o.student === 'string' ? o.student : '',
    rungs,
  };
}

/** Records that a tool tab was opened on a rung (once per tool). */
export function noteTool(p: Progress, rung: number, tool: ToolName): void {
  const r = p.rungs[rung];
  if (r && !r.toolsUsed.includes(tool)) r.toolsUsed.push(tool);
}

/** Marks a rung solved and unlocks the next one. */
export function markSolved(p: Progress, rung: number, now = Date.now()): void {
  const r = p.rungs[rung];
  if (!r || r.status === 'solved') return;
  r.status = 'solved';
  r.solvedAt = now;
  const next = p.rungs[rung + 1];
  if (next && next.status === 'locked') {
    next.status = 'open';
    next.startedAt = now;
  }
}

/** Index of the first unsolved rung, or the rung count when all are solved. */
export function currentRung(p: Progress): number {
  const i = p.rungs.findIndex((r) => r.status !== 'solved');
  return i === -1 ? p.rungs.length : i;
}

/** Seconds a rung has been open (until solved, or until `now`). */
export function secondsOnRung(r: RungProgress, now = Date.now()): number {
  if (r.startedAt === undefined) return 0;
  return Math.max(0, Math.round(((r.solvedAt ?? now) - r.startedAt) / 1000));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
}

export interface DashboardRow {
  student: string;
  ladderTitle: string;
  /** 1-based rung the student is on, or "done". */
  stuckOn: string;
  solved: number;
  total: number;
  totalSeconds: number;
  hints: number;
  /** Seconds per rung, in rung order (0 for rungs not yet opened). */
  perRung: number[];
  tools: string;
}

/** One dashboard row per exported progress record. */
export function dashboardRows(records: Progress[], now = Date.now()): DashboardRow[] {
  return records.map((p) => {
    const cur = currentRung(p);
    const perRung = p.rungs.map((r) => secondsOnRung(r, now));
    const toolCounts = new Map<string, number>();
    for (const r of p.rungs) for (const t of r.toolsUsed) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    return {
      student: p.student || '(unnamed)',
      ladderTitle: p.ladderTitle,
      stuckOn: cur >= p.rungs.length ? 'done' : `rung ${cur + 1}`,
      solved: p.rungs.filter((r) => r.status === 'solved').length,
      total: p.rungs.length,
      totalSeconds: perRung.reduce((a, b) => a + b, 0),
      hints: p.rungs.reduce((a, r) => a + r.hintsUsed, 0),
      perRung,
      tools: [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${t} x${n}`)
        .join(', '),
    };
  });
}

/** Per-rung summary across a class: how many students are on it, and median time to solve. */
export function rungSummary(records: Progress[], rungCount: number, now = Date.now()): { rung: number; stuck: number; solved: number; medianSeconds: number }[] {
  const out = [];
  for (let i = 0; i < rungCount; i++) {
    const times: number[] = [];
    let stuck = 0;
    for (const p of records) {
      const r = p.rungs[i];
      if (!r) continue;
      if (r.status === 'solved') times.push(secondsOnRung(r, now));
      else if (r.status === 'open') stuck++;
    }
    times.sort((a, b) => a - b);
    const median = times.length === 0 ? 0 : times.length % 2 ? times[(times.length - 1) / 2] : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2);
    out.push({ rung: i + 1, stuck, solved: times.length, medianSeconds: median });
  }
  return out;
}
