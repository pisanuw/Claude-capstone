/**
 * Re-test diff: what changed between two runs of the same assignment, both in
 * the text the instructor edited and in how well AI scored.
 */
import { headline, rowStats } from './report.js';
import type { Run } from './types.js';

export type LineOp = { op: 'same' | 'add' | 'del'; text: string };

/** Line diff by longest common subsequence (assignments are short). */
export function lineDiff(before: string, after: string): LineOp[] {
  const a = before.replace(/\r\n?/g, '\n').split('\n');
  const b = after.replace(/\r\n?/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', text: a[i++] });
    else out.push({ op: 'add', text: b[j++] });
  }
  while (i < n) out.push({ op: 'del', text: a[i++] });
  while (j < m) out.push({ op: 'add', text: b[j++] });
  return out;
}

export function normLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface RowChange {
  label: string;
  before: number | null;
  after: number | null;
  /** after - before, in fraction of the row; null if either side is missing. */
  delta: number | null;
}

export interface RunDiff {
  best: { before: number | null; after: number | null };
  lazy: { before: number | null; after: number | null };
  rows: RowChange[];
  prompt: LineOp[];
  rubric: LineOp[];
  changedText: boolean;
}

export function diffRuns(before: Run, after: Run): RunDiff {
  const hb = headline(before);
  const ha = headline(after);
  const sb = rowStats(before);
  const sa = rowStats(after);
  const seen = new Set<string>();
  const rows: RowChange[] = [];
  for (const s of sa) {
    const key = normLabel(s.row.label);
    seen.add(key);
    const old = sb.find((x) => normLabel(x.row.label) === key);
    const b = old ? old.best : null;
    rows.push({ label: s.row.label, before: b, after: s.best, delta: b !== null && s.best !== null ? s.best - b : null });
  }
  for (const s of sb) {
    if (!seen.has(normLabel(s.row.label))) rows.push({ label: s.row.label, before: s.best, after: null, delta: null });
  }
  const prompt = lineDiff(before.assignment.prompt, after.assignment.prompt);
  const rubric = lineDiff(before.assignment.rubricText, after.assignment.rubricText);
  return {
    best: { before: hb.best, after: ha.best },
    lazy: { before: hb.lazy, after: ha.lazy },
    rows,
    prompt,
    rubric,
    changedText: [...prompt, ...rubric].some((l) => l.op !== 'same'),
  };
}
