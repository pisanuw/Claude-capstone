/**
 * Rubric scoring. Rows tagged {tests} are scored from the autograder; every
 * other row goes to a judge model with the instructor's rubric. The judge
 * prompt and reply parser are shared by API mode and paste mode, so a judge
 * reply pasted from any chat tool is read the same way.
 */
import { globMatch } from './rubric.js';
import type { Assignment, RowScore, RubricRow, TestRun } from './types.js';

export const JUDGE_SYSTEM =
  'You are grading one student submission against the instructor\'s rubric, as a strict but fair ' +
  'teaching assistant would. Score each rubric row independently from 0 to its maximum, using ' +
  'partial credit where the rubric allows it. Judge only what is in the submission: do not give ' +
  'credit for things it promises but does not do. Reply with JSON only, no prose and no code fences, ' +
  'shaped as {"rows":[{"id":"r1","points":7,"reason":"one sentence"}]} with one entry per row id.';

/** JSON schema for structured outputs, matching the shape in JUDGE_SYSTEM. */
export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          points: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['id', 'points', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;

/** Rows the judge scores: everything not handed to the autograder. */
export function judgeRows(rows: RubricRow[], a: Assignment): RubricRow[] {
  const hasTests = !!a.code && a.code.tests.length > 0;
  return rows.filter((r) => !(hasTests && r.tests));
}

export function buildJudgePrompt(a: Assignment, rows: RubricRow[], submission: string): string {
  const rubric = rows
    .map((r) => `- id ${r.id}: ${r.label} (max ${r.points})${r.description ? `: ${r.description}` : ''}`)
    .join('\n');
  return (
    `ASSIGNMENT:\n${a.prompt.trim()}\n\n` +
    `RUBRIC ROWS TO SCORE:\n${rubric}\n\n` +
    `SUBMISSION:\n<<<\n${submission.trim()}\n>>>\n\n` +
    `Return the JSON object with exactly these ids: ${rows.map((r) => r.id).join(', ')}.`
  );
}

/** Paste mode: one block to copy into any chat tool. */
export function judgePacket(a: Assignment, rows: RubricRow[], submission: string): string {
  return `${JUDGE_SYSTEM}\n\n${buildJudgePrompt(a, rows, submission)}`;
}

/** First balanced {...} in the text, ignoring braces inside strings. */
export function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export interface JudgeParse {
  scores: RowScore[];
  warnings: string[];
}

/** Read a judge reply. Points are clamped to the row; missing rows come back unscored. */
export function parseJudgeReply(text: string, rows: RubricRow[]): JudgeParse {
  const warnings: string[] = [];
  const json = firstJsonObject(text);
  let entries: unknown[] = [];
  if (!json) {
    warnings.push('The judge reply had no JSON object.');
  } else {
    try {
      const parsed = JSON.parse(json) as { rows?: unknown };
      if (Array.isArray(parsed.rows)) entries = parsed.rows;
      else warnings.push('The judge JSON has no "rows" array.');
    } catch {
      warnings.push('The judge reply JSON did not parse.');
    }
  }
  const byId = new Map<string, { points: unknown; reason: unknown }>();
  for (const e of entries) {
    if (e && typeof e === 'object' && 'id' in e) {
      const o = e as { id: unknown; points?: unknown; reason?: unknown };
      byId.set(String(o.id), { points: o.points, reason: o.reason });
    }
  }
  const scores = rows.map((r): RowScore => {
    const e = byId.get(r.id);
    const p = typeof e?.points === 'number' ? e.points : Number(e?.points);
    if (!e || !Number.isFinite(p)) {
      if (e) warnings.push(`Row ${r.id} had no numeric points.`);
      else if (json) warnings.push(`The judge skipped row ${r.id}.`);
      return { id: r.id, points: null, reason: 'Not scored by the judge.', source: 'judge' };
    }
    if (p > r.points || p < 0) warnings.push(`Row ${r.id} score ${p} was clamped to 0..${r.points}.`);
    return {
      id: r.id,
      points: Math.min(r.points, Math.max(0, p)),
      reason: typeof e.reason === 'string' ? e.reason : '',
      source: 'judge',
    };
  });
  return { scores, warnings };
}

/** Scores for {tests} rows: the row's points times the share of its tests that passed. */
export function testRowScores(rows: RubricRow[], a: Assignment, run: TestRun | null): RowScore[] {
  if (!a.code || a.code.tests.length === 0) return [];
  return rows
    .filter((r) => r.tests)
    .map((r): RowScore => {
      if (!run || run.status === 'no-code') {
        return { id: r.id, points: 0, reason: 'No code found in the reply, so no tests ran.', source: 'tests' };
      }
      if (run.status !== 'ok') {
        return { id: r.id, points: 0, reason: `Tests did not run: ${run.status}.`, source: 'tests' };
      }
      const patterns = r.tests ?? [];
      const mine = run.results.filter(
        (t) => t.outcome !== 'skipped' && (patterns.length === 0 || patterns.some((p) => globMatch(p, t.name))),
      );
      if (mine.length === 0) {
        return { id: r.id, points: null, reason: `No tests match ${patterns.join(', ')}.`, source: 'tests' };
      }
      const passed = mine.filter((t) => t.outcome === 'passed').length;
      return {
        id: r.id,
        points: Math.round(((r.points * passed) / mine.length) * 100) / 100,
        reason: `${passed} of ${mine.length} tests passed.`,
        source: 'tests',
      };
    });
}

/** Put scores in rubric order. */
export function orderScores(rows: RubricRow[], scores: RowScore[]): RowScore[] {
  const byId = new Map(scores.map((s) => [s.id, s]));
  return rows.map((r) => byId.get(r.id) ?? { id: r.id, points: null, reason: 'Not scored.', source: 'judge' });
}
