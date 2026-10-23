/**
 * Tolerant rubric parser. Instructors paste rubrics in whatever shape their
 * syllabus uses, so two forms are accepted:
 *
 *   1. Lines: one row per unindented line carrying a point value, e.g.
 *        Correctness (40 pts) {tests}
 *          Passes the hidden tests
 *        Edge cases [10] {tests: test_empty*, test_negative*}
 *        Reflection - 20 points
 *      Indented lines that follow are the row's description.
 *   2. A Markdown table with a points column.
 *
 * `{tests}` hands the row to the autograder (all tests), `{tests: a*, b}`
 * restricts it to matching test names.
 */
import type { RubricRow } from './types.js';

export interface ParsedRubric {
  rows: RubricRow[];
  warnings: string[];
  total: number;
}

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(?:pts?|points?|marks?)';
const POINT_PATTERNS: RegExp[] = [
  new RegExp(`\\(\\s*${NUM}\\s*${UNIT}?\\s*\\)`, 'i'),
  new RegExp(`\\[\\s*${NUM}\\s*${UNIT}?\\s*\\]`, 'i'),
  new RegExp(`${NUM}\\s*${UNIT}\\b`, 'i'),
  new RegExp(`[:\\-–|]\\s*${NUM}\\s*$`),
];
const TESTS_TAG = /\{\s*tests\s*(?::\s*([^}]*))?\}/i;

function parseTestsTag(text: string): { rest: string; tests: string[] | null } {
  const m = TESTS_TAG.exec(text);
  if (!m) return { rest: text, tests: null };
  const tests = (m[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { rest: text.replace(m[0], ' '), tests };
}

function cleanLabel(text: string): string {
  return text
    .replace(/^\s*(?:[-*+•]|\d+[.)]|[a-z][.)])\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:\-–|,]+$/, '')
    .replace(/^[\s:\-–|,]+/, '')
    .trim();
}

/** Pull a point value out of a header line; null if the line has none. */
export function extractPoints(line: string): { points: number; rest: string } | null {
  for (const re of POINT_PATTERNS) {
    const m = re.exec(line);
    if (m) return { points: Number(m[1]), rest: line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length) };
  }
  return null;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parseTable(lines: string[]): ParsedRubric {
  const warnings: string[] = [];
  const rows: RubricRow[] = [];
  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const pointsCol = header.findIndex((h) => /point|pts|weight|marks|score/.test(h));
  let labelCol = header.findIndex((h) => /criteri|category|item|row|component|skill/.test(h));
  if (labelCol < 0) labelCol = pointsCol === 0 ? 1 : 0;
  if (pointsCol < 0) {
    return { rows, warnings: ['The table has no points column (name one "Points").'], total: 0 };
  }
  for (const line of lines.slice(1)) {
    if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
    const cells = splitRow(line);
    const joined = cells.join(' ');
    const { tests } = parseTestsTag(joined);
    const pts = /\d+(?:\.\d+)?/.exec(cells[pointsCol] ?? '');
    const label = cleanLabel(parseTestsTag(cells[labelCol] ?? '').rest);
    if (!pts || !label) {
      warnings.push(`Skipped table row "${joined.slice(0, 60)}": no label or points.`);
      continue;
    }
    const description = cells
      .filter((_, i) => i !== pointsCol && i !== labelCol)
      .map((c) => parseTestsTag(c).rest.trim())
      .filter(Boolean)
      .join(' ');
    rows.push({ id: `r${rows.length + 1}`, label, points: Number(pts[0]), description, tests });
  }
  return { rows, warnings, total: sum(rows) };
}

function sum(rows: RubricRow[]): number {
  return rows.reduce((a, r) => a + r.points, 0);
}

export function parseRubric(text: string): ParsedRubric {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return { rows: [], warnings: ['The rubric is empty.'], total: 0 };
  const tableLines = nonEmpty.filter((l) => l.trim().startsWith('|'));
  if (tableLines.length >= 2 && tableLines.length >= nonEmpty.length / 2) return parseTable(tableLines);

  const rows: RubricRow[] = [];
  const warnings: string[] = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const indented = /^\s/.test(raw);
    const current = rows[rows.length - 1];
    if (indented && current) {
      current.description = (current.description + ' ' + raw.trim()).trim();
      return;
    }
    const { rest, tests } = parseTestsTag(raw);
    const found = extractPoints(rest);
    if (!found) {
      if (current) {
        current.description = (current.description + ' ' + raw.trim()).trim();
        warnings.push(`Line ${i + 1} has no points, so it was added to "${current.label}" as description.`);
      } else {
        warnings.push(`Line ${i + 1} has no points and was ignored.`);
      }
      return;
    }
    const label = cleanLabel(found.rest);
    if (!label) {
      warnings.push(`Line ${i + 1} has points but no criterion name and was ignored.`);
      return;
    }
    rows.push({ id: `r${rows.length + 1}`, label, points: found.points, description: '', tests });
  });
  if (rows.length === 0) warnings.push('No rubric rows found: give each row a point value, e.g. "Correctness (40)".');
  return { rows, warnings, total: sum(rows) };
}

/** Shell-style glob match for test names (only * and ?). */
export function globMatch(pattern: string, name: string): boolean {
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return re.test(name);
}
