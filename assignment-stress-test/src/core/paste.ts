/**
 * Paste mode, for models with no browser API (ChatGPT, Gemini, a campus
 * Copilot) or instructors without an API key. The app hands out the exact
 * turns each style sends; the instructor pastes the final reply back, and
 * then either a Claude judge or a judge reply pasted from any chat tool.
 */
import { judgeRows, orderScores, parseJudgeReply, testRowScores } from './grader.js';
import { styleSpec, styleTurns } from './prompts.js';
import { gradeTests, refusedScores, type Autograder } from './runner.js';
import type { Assignment, Cell, ChatTurn, RubricRow, StyleId } from './types.js';

export function pasteInstructions(style: StyleId, a: Assignment): string {
  const turns = styleTurns(style, a);
  const head =
    `${styleSpec(style).name}: start a new chat with no custom instructions or memory, ` +
    (turns.length === 1 ? 'send this one message' : `send these ${turns.length} messages in order, waiting for each reply`) +
    ', then paste the last reply back.';
  return [head, ...turns.map((t, i) => (turns.length === 1 ? t : `----- message ${i + 1} of ${turns.length} -----\n${t}`))].join('\n\n');
}

export interface PastedAttempt {
  modelLabel: string;
  style: StyleId;
  reply: string;
  refused: boolean;
}

/** A cell from a pasted reply; scores come later from a judge. */
export function pastedCell(p: PastedAttempt, a: Assignment): Cell {
  const transcript: ChatTurn[] = styleTurns(p.style, a).map((content) => ({ role: 'user', content }));
  if (!p.refused) transcript.push({ role: 'assistant', content: p.reply });
  return {
    model: p.modelLabel.trim() || 'Pasted model',
    style: p.style,
    status: p.refused ? 'refused' : 'done',
    error: p.refused ? 'Marked refused by the instructor.' : '',
    transcript,
    output: p.refused ? '' : p.reply,
    tests: null,
    scores: [],
  };
}

/** Score a pasted cell: tests in the browser, plus a judge reply pasted as text. */
export async function scorePasted(
  cell: Cell,
  a: Assignment,
  rows: RubricRow[],
  judgeReply: string,
  autograde: Autograder | null,
): Promise<{ cell: Cell; warnings: string[] }> {
  if (cell.status === 'refused') return { cell: { ...cell, scores: refusedScores(rows) }, warnings: [] };
  const tests = await gradeTests(a, cell.output, autograde);
  const scores = testRowScores(rows, a, tests);
  const toJudge = judgeRows(rows, a);
  let warnings: string[] = [];
  if (toJudge.length > 0) {
    const parsed = parseJudgeReply(judgeReply, toJudge);
    scores.push(...parsed.scores);
    warnings = parsed.warnings;
  }
  return { cell: { ...cell, tests, scores: orderScores(rows, scores), error: warnings.join(' ') }, warnings };
}
