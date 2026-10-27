// A gradebook is students x items. Each item (a quiz question, a homework
// problem) belongs to one topic and has a maximum score. A student's mastery
// of a topic is the share of the available points they earned on the items
// of that topic they attempted; blank cells are skipped, not counted as zero.

import { parseCsv } from './csv';

export interface Item {
  /** Column index in the source table. */
  col: number;
  header: string;
  topic: string;
  max: number;
}

export interface Student {
  id: string;
  name: string;
  /** Score per item column; null when blank. */
  scores: (number | null)[];
}

export interface Gradebook {
  items: Item[];
  students: Student[];
  /** Header cells that were neither an identity column nor a score column. */
  ignored: string[];
  warnings: string[];
}

const ID_HEADERS = /^(id|student ?id|sid|login|user(name)?|email|e-mail|netid|uw ?netid)$/i;
const NAME_HEADERS = /^(name|student|student name|full name|display name|first name|preferred name)$/i;
const SKIP_HEADERS = /^(total|final|grade|letter|section|course|percent(age)?|%|last name|surname)$/i;

/**
 * Reads the topic and maximum from a header such as "Q3 [recursion] /5",
 * "HW2 (graphs) out of 10" or "Recursion: Q3". Returns null fields when absent.
 */
export function parseHeader(header: string): { label: string; topic: string | null; max: number | null } {
  let h = header.trim();
  let max: number | null = null;
  const m = /(?:\/\s*|out of\s+|max\s*[:=]?\s*|pts?\s*[:=]\s*)(\d+(?:\.\d+)?)\s*(?:pts?|points?)?\s*\)?\s*$/i.exec(h);
  if (m) {
    max = Number(m[1]);
    h = h.slice(0, m.index).replace(/[\s(]+$/, '').trim();
  }
  let topic: string | null = null;
  const br = /\[([^\]]+)\]|\(([^)]+)\)/.exec(h);
  if (br) {
    topic = (br[1] ?? br[2] ?? '').trim();
    h = (h.slice(0, br.index) + h.slice(br.index + br[0].length)).replace(/\s+/g, ' ').trim();
  } else {
    const colon = /^([^:]+):\s*(.+)$/.exec(h);
    if (colon) {
      topic = (colon[1] as string).trim();
      h = (colon[2] as string).trim();
    }
  }
  return { label: (h || header.trim()).replace(/\s+/g, ' '), topic: topic ? normaliseTopic(topic) : null, max };
}

export function normaliseTopic(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseScore(cell: string): number | null | 'bad' {
  const s = cell.trim();
  if (s === '' || s === '-' || /^(n\/?a|ex|excused|missing)$/i.test(s)) return null;
  const pct = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (pct) return Number(pct[1]) / 100;
  const frac = /^(-?\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?$/.exec(s);
  if (frac) return Number(frac[1]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 'bad';
}

export interface ColumnPlan {
  col: number;
  header: string;
  role: 'id' | 'name' | 'item' | 'ignore';
  topic: string;
  max: number | null;
}

/** First guess at what each column is, from headers and cell contents. */
export function planColumns(table: string[][]): ColumnPlan[] {
  const header = table[0] ?? [];
  const body = table.slice(1);
  let haveId = false;
  let haveName = false;
  return header.map((raw, col) => {
    const h = raw.trim();
    const cells = body.map((r) => r[col] ?? '');
    const parsed = cells.map(parseScore);
    const numeric = parsed.filter((v) => typeof v === 'number').length;
    const bad = parsed.filter((v) => v === 'bad').length;
    if (!haveId && ID_HEADERS.test(h)) {
      haveId = true;
      return { col, header: h, role: 'id', topic: '', max: null };
    }
    if (!haveName && NAME_HEADERS.test(h)) {
      haveName = true;
      return { col, header: h, role: 'name', topic: '', max: null };
    }
    if (SKIP_HEADERS.test(h) || numeric === 0 || bad > numeric) {
      if (!haveName && bad > 0 && numeric === 0 && col <= 1) {
        haveName = true;
        return { col, header: h, role: 'name', topic: '', max: null };
      }
      return { col, header: h, role: 'ignore', topic: '', max: null };
    }
    const p = parseHeader(h);
    return { col, header: h, role: 'item', topic: p.topic ?? normaliseTopic(p.label), max: p.max };
  });
}

/** Builds a gradebook from a table and a column plan. Missing maxima become the highest score seen. */
export function buildGradebook(table: string[][], plan: ColumnPlan[]): Gradebook {
  const warnings: string[] = [];
  const body = table.slice(1);
  const idCol = plan.find((p) => p.role === 'id')?.col ?? null;
  const nameCol = plan.find((p) => p.role === 'name')?.col ?? null;
  const itemPlans = plan.filter((p) => p.role === 'item' && p.topic.trim() !== '');
  const ignored = plan.filter((p) => p.role === 'ignore').map((p) => p.header);
  const items: Item[] = itemPlans.map((p) => {
    let max = p.max;
    if (max === null || !(max > 0)) {
      const seen = body.map((r) => parseScore(r[p.col] ?? '')).filter((v): v is number => typeof v === 'number');
      const hi = Math.max(0, ...seen);
      max = hi <= 1 && seen.some((v) => v > 0 && v < 1) ? 1 : hi;
      if (max > 0) warnings.push(`"${p.header}" has no maximum in its header; using the highest score seen (${max}).`);
    }
    return { col: p.col, header: p.header, topic: normaliseTopic(p.topic), max };
  });
  const usable = items.filter((it) => it.max > 0);
  for (const it of items) if (it.max <= 0) warnings.push(`"${it.header}" has no positive scores and is skipped.`);
  const seenIds = new Map<string, number>();
  const students: Student[] = body.map((r, k) => {
    const name = nameCol !== null ? (r[nameCol] ?? '').trim() : '';
    let id = idCol !== null ? (r[idCol] ?? '').trim() : '';
    if (!id) id = name || `row ${k + 2}`;
    const dup = seenIds.get(id) ?? 0;
    seenIds.set(id, dup + 1);
    if (dup) {
      warnings.push(`Duplicate student "${id}" on row ${k + 2}; renamed "${id} (${dup + 1})".`);
      id = `${id} (${dup + 1})`;
    }
    const scores = usable.map((it) => {
      const v = parseScore(r[it.col] ?? '');
      if (v === 'bad') {
        warnings.push(`Row ${k + 2}, "${it.header}": "${r[it.col]}" is not a number and is treated as blank.`);
        return null;
      }
      if (v !== null && v > it.max * 1.5) warnings.push(`Row ${k + 2}, "${it.header}": ${v} is well above the maximum ${it.max}.`);
      return v;
    });
    return { id, name: name || id, scores };
  });
  return { items: usable, students, ignored, warnings };
}

export function gradebookFromCsv(text: string): { table: string[][]; plan: ColumnPlan[]; book: Gradebook } {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('The CSV needs a header row and at least one student.');
  const plan = planColumns(table);
  const book = buildGradebook(table, plan);
  if (!book.items.length) throw new Error('No score columns found. Each score column needs numbers in it.');
  return { table, plan, book };
}

export interface Thresholds {
  /** At or above: strong, can help others. */
  strong: number;
  /** Below: a gap. Between gap and strong: shaky. */
  gap: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { strong: 0.8, gap: 0.6 };

export type Level = 'strong' | 'shaky' | 'gap' | 'none';

export interface Profile {
  student: Student;
  /** Mastery 0..1 per topic, null when nothing in that topic was attempted. */
  mastery: Map<string, number | null>;
}

export function topicsOf(book: Gradebook): string[] {
  const seen: string[] = [];
  for (const it of book.items) if (!seen.includes(it.topic)) seen.push(it.topic);
  return seen;
}

export function profiles(book: Gradebook): Profile[] {
  const topics = topicsOf(book);
  return book.students.map((student) => {
    const mastery = new Map<string, number | null>();
    for (const t of topics) {
      let got = 0;
      let max = 0;
      book.items.forEach((it, k) => {
        const v = student.scores[k];
        if (it.topic !== t || v === null || v === undefined) return;
        got += Math.max(0, Math.min(v, it.max));
        max += it.max;
      });
      mastery.set(t, max > 0 ? got / max : null);
    }
    return { student, mastery };
  });
}

export function level(m: number | null | undefined, th: Thresholds): Level {
  if (m === null || m === undefined) return 'none';
  if (m >= th.strong) return 'strong';
  if (m < th.gap) return 'gap';
  return 'shaky';
}

/** Class mean mastery per topic, over students who attempted it. */
export function topicMeans(ps: Profile[], topics: string[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const t of topics) {
    const xs = ps.map((p) => p.mastery.get(t)).filter((v): v is number => typeof v === 'number');
    out.set(t, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  }
  return out;
}
