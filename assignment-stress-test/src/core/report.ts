/**
 * Turns a run into the vulnerability report: a model x style score matrix,
 * per-row statistics and a bucket per rubric row. Rows are bucketed on the
 * best attempt, because a student only needs one attempt to work.
 */
import { modelName } from './anthropic.js';
import { STYLES, styleSpec } from './prompts.js';
import { parseRubric } from './rubric.js';
import type { Cell, Run, RubricRow, StyleId } from './types.js';

export type Bucket = 'easy' | 'partial' | 'holds' | 'unscored';

export const EASY_AT = 0.85;
export const PARTIAL_AT = 0.5;

export const BUCKETS: Record<Bucket, { name: string; advice: string }> = {
  easy: {
    name: 'AI meets it',
    advice:
      'At least one attempt earned 85% or more of this row. Weight it less in the take-home grade, or pair it with process evidence: drafts, commit history, or a short oral check.',
  },
  partial: {
    name: 'AI gets partway',
    advice:
      'The best attempt earned half to 85%. Read the judge reasons to see what the AI misses; that gap is what the row still measures.',
  },
  holds: {
    name: 'Holds up',
    advice:
      'No attempt earned half of this row. Keep it, and re-test next term: this is a lower bound on AI ability, not a guarantee.',
  },
  unscored: { name: 'Not scored', advice: 'No attempt produced a score for this row.' },
};

export const LOWER_BOUND_NOTE =
  'These scores are a lower bound on what AI can do with this assignment: three prompt styles on a few models, scored once. ' +
  'A determined student with more attempts, other tools or better prompts can do better. A low score is not proof that an assignment is AI-proof.';

export function bucketFor(best: number | null): Bucket {
  if (best === null) return 'unscored';
  if (best >= EASY_AT) return 'easy';
  if (best >= PARTIAL_AT) return 'partial';
  return 'holds';
}

export function runRows(run: Run): RubricRow[] {
  return parseRubric(run.assignment.rubricText).rows;
}

/** Fraction of the scored points a cell earned; null if nothing was scored. */
export function cellFraction(cell: Cell, rows: RubricRow[]): number | null {
  if (cell.status === 'error') return null;
  let got = 0;
  let max = 0;
  for (const r of rows) {
    const s = cell.scores.find((x) => x.id === r.id);
    if (!s || s.points === null) continue;
    got += s.points;
    max += r.points;
  }
  return max > 0 ? got / max : null;
}

export interface RowStat {
  row: RubricRow;
  mean: number | null;
  best: number | null;
  bestCell: string;
  lazy: number | null;
  bucket: Bucket;
}

function fractionOn(cell: Cell, row: RubricRow): number | null {
  if (cell.status === 'error' || row.points <= 0) return null;
  const s = cell.scores.find((x) => x.id === row.id);
  return s && s.points !== null ? s.points / row.points : null;
}

export function cellLabel(cell: Pick<Cell, 'model' | 'style'>): string {
  return `${modelName(cell.model)}, ${styleSpec(cell.style).name.toLowerCase()}`;
}

export function rowStats(run: Run): RowStat[] {
  return runRows(run).map((row) => {
    const vals: { f: number; cell: Cell }[] = [];
    for (const cell of run.cells) {
      const f = fractionOn(cell, row);
      if (f !== null) vals.push({ f, cell });
    }
    const lazyVals = vals.filter((v) => v.cell.style === 'lazy').map((v) => v.f);
    const top = vals.reduce<{ f: number; cell: Cell } | null>((a, v) => (!a || v.f > a.f ? v : a), null);
    const best = top ? top.f : null;
    return {
      row,
      mean: vals.length ? vals.reduce((a, v) => a + v.f, 0) / vals.length : null,
      best,
      bestCell: top ? cellLabel(top.cell) : '',
      lazy: lazyVals.length ? Math.max(...lazyVals) : null,
      bucket: bucketFor(best),
    };
  });
}

export interface Headline {
  best: number | null;
  bestCell: string;
  lazy: number | null;
  mean: number | null;
  attempts: number;
  refused: number;
  failed: number;
}

export function headline(run: Run): Headline {
  const rows = runRows(run);
  let best: number | null = null;
  let bestCell = '';
  let lazy: number | null = null;
  const all: number[] = [];
  for (const cell of run.cells) {
    const f = cellFraction(cell, rows);
    if (f === null) continue;
    all.push(f);
    if (best === null || f > best) {
      best = f;
      bestCell = cellLabel(cell);
    }
    if (cell.style === 'lazy' && (lazy === null || f > lazy)) lazy = f;
  }
  return {
    best,
    bestCell,
    lazy,
    mean: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null,
    attempts: run.cells.length,
    refused: run.cells.filter((c) => c.status === 'refused').length,
    failed: run.cells.filter((c) => c.status === 'error').length,
  };
}

export function pct(f: number | null): string {
  return f === null ? 'n/a' : `${Math.round(f * 100)}%`;
}

export function verdict(h: Headline): string {
  if (h.best === null) return 'No attempt was scored, so there is no verdict yet.';
  const parts: string[] = [];
  if (h.lazy !== null) parts.push(`A lazy copy-paste earns ${pct(h.lazy)}.`);
  parts.push(`The best attempt (${h.bestCell}) earns ${pct(h.best)}.`);
  if (h.best >= EASY_AT) parts.push('As written, AI can complete this assignment.');
  else if (h.best >= PARTIAL_AT) parts.push('AI gets a passing share but not full marks.');
  else parts.push('No attempt reached half marks.');
  return parts.join(' ');
}

export interface Matrix {
  models: string[];
  styles: StyleId[];
  value(model: string, style: StyleId): { fraction: number | null; status: Cell['status'] } | null;
}

export function matrix(run: Run): Matrix {
  const rows = runRows(run);
  const models = [...new Set(run.cells.map((c) => c.model))];
  const styles = STYLES.map((s) => s.id).filter((id) => run.cells.some((c) => c.style === id));
  return {
    models,
    styles,
    value(model, style) {
      const cell = run.cells.find((c) => c.model === model && c.style === style);
      return cell ? { fraction: cellFraction(cell, rows), status: cell.status } : null;
    },
  };
}

/** Instructor override of one score; returns a new run. */
export function overrideScore(run: Run, cellIndex: number, rowId: string, points: number | null): Run {
  const rows = runRows(run);
  const row = rows.find((r) => r.id === rowId);
  if (!row) throw new Error(`No rubric row ${rowId}`);
  const clamped = points === null ? null : Math.min(row.points, Math.max(0, points));
  const cells = run.cells.map((c, i) => {
    if (i !== cellIndex) return c;
    const scores = c.scores.map((s) =>
      s.id === rowId ? { id: rowId, points: clamped, reason: 'Set by the instructor.', source: 'instructor' as const } : s,
    );
    return { ...c, scores };
  });
  return { ...run, cells };
}
