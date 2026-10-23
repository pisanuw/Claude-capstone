/**
 * Orchestrates a stress test: every model x style attempt, then the
 * autograder and the judge for each. Providers and the autograder are
 * injected so the whole pipeline runs under test with fakes.
 */
import type { ChatModel } from './anthropic.js';
import { describeError } from './anthropic.js';
import { JUDGE_SCHEMA, JUDGE_SYSTEM, buildJudgePrompt, judgeRows, orderScores, parseJudgeReply, testRowScores } from './grader.js';
import { buildPayload, type HarnessPayload } from './harness.js';
import { extractCode, styleSpec, styleTurns } from './prompts.js';
import type { Assignment, Cell, ChatTurn, RowScore, RubricRow, StyleId, TestRun } from './types.js';

export type Autograder = (payload: HarnessPayload) => Promise<TestRun>;

export interface RunPlan {
  assignment: Assignment;
  rows: RubricRow[];
  models: ChatModel[];
  styles: StyleId[];
  judge: ChatModel;
  autograde: Autograder | null;
  concurrency?: number;
  onProgress?: (done: number, total: number, cell: Cell) => void;
  signal?: { aborted: boolean };
}

/** Run the tests for one reply (or record that the reply had no code). */
export async function gradeTests(a: Assignment, output: string, autograde: Autograder | null): Promise<TestRun | null> {
  if (!a.code || a.code.tests.length === 0) return null;
  const code = extractCode(output);
  if (code === null) return { status: 'no-code', results: [], log: 'No Python code block found in the reply.' };
  if (!autograde) return { status: 'harness-error', results: [], log: 'No autograder available.' };
  try {
    return await autograde(buildPayload(a.code, code));
  } catch (err) {
    return { status: 'harness-error', results: [], log: describeError(err) };
  }
}

export function refusedScores(rows: RubricRow[]): RowScore[] {
  return rows.map((r) => ({ id: r.id, points: 0, reason: 'The model refused, so this attempt earns nothing.', source: 'judge' }));
}

/** One attempt: send the style's turns in order, keeping the replies. */
export async function attempt(model: ChatModel, style: StyleId, a: Assignment): Promise<Cell> {
  const spec = styleSpec(style);
  const transcript: ChatTurn[] = [];
  const cell: Cell = { model: model.id, style, status: 'done', error: '', transcript, output: '', tests: null, scores: [] };
  try {
    for (const turn of styleTurns(style, a)) {
      transcript.push({ role: 'user', content: turn });
      const reply = await model.chat(transcript, { effort: spec.effort });
      if (reply.refused) {
        cell.status = 'refused';
        cell.error = reply.note;
        return cell;
      }
      transcript.push({ role: 'assistant', content: reply.text });
      if (reply.note) cell.error = reply.note;
    }
    cell.output = transcript[transcript.length - 1].content;
  } catch (err) {
    cell.status = 'error';
    cell.error = describeError(err);
  }
  return cell;
}

/** Autograder plus judge for a finished attempt. Judge failures leave rows unscored. */
export async function gradeCell(cell: Cell, plan: Pick<RunPlan, 'assignment' | 'rows' | 'judge' | 'autograde'>): Promise<Cell> {
  const { assignment: a, rows } = plan;
  if (cell.status === 'refused') return { ...cell, scores: refusedScores(rows) };
  if (cell.status === 'error') return { ...cell, scores: orderScores(rows, []) };
  const tests = await gradeTests(a, cell.output, plan.autograde);
  const scores = testRowScores(rows, a, tests);
  const toJudge = judgeRows(rows, a);
  let note = cell.error;
  if (toJudge.length > 0) {
    try {
      const reply = await plan.judge.chat([{ role: 'user', content: buildJudgePrompt(a, toJudge, cell.output) }], {
        system: JUDGE_SYSTEM,
        schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
        effort: 'medium',
        maxTokens: 4000,
      });
      const parsed = parseJudgeReply(reply.text, toJudge);
      scores.push(...parsed.scores);
      if (parsed.warnings.length) note = [note, ...parsed.warnings].filter(Boolean).join(' ');
    } catch (err) {
      note = [note, `Judge failed: ${describeError(err)}`].filter(Boolean).join(' ');
    }
  }
  return { ...cell, tests, scores: orderScores(rows, scores), error: note };
}

export async function runStressTest(plan: RunPlan): Promise<Cell[]> {
  const jobs: { model: ChatModel; style: StyleId }[] = [];
  for (const model of plan.models) for (const style of plan.styles) jobs.push({ model, style });
  const cells: Cell[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++;
      const { model, style } = jobs[i];
      let cell: Cell;
      if (plan.signal?.aborted) {
        cell = { model: model.id, style, status: 'error', error: 'Stopped before it ran.', transcript: [], output: '', tests: null, scores: orderScores(plan.rows, []) };
      } else {
        cell = await gradeCell(await attempt(model, style, plan.assignment), plan);
      }
      cells[i] = cell;
      plan.onProgress?.(++done, jobs.length, cell);
    }
  };
  const n = Math.max(1, Math.min(plan.concurrency ?? 3, jobs.length));
  await Promise.all(Array.from({ length: n }, worker));
  return cells;
}

/** API calls a plan will make: one per user turn, plus one judge call per attempt. */
export function callCount(models: number, styles: StyleId[], a: Assignment, rows: RubricRow[]): number {
  const turns = styles.reduce((s, st) => s + styleTurns(st, a).length, 0);
  const judged = judgeRows(rows, a).length > 0 ? styles.length : 0;
  return models * (turns + judged);
}
