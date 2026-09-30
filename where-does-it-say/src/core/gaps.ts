/**
 * The question log and the instructor's gap report.
 *
 * Every question is logged with its outcome. Questions the documents could
 * not answer, and answers a student marked as not helpful, are the gaps.
 * The report groups them by week and by similar wording, and lists the words
 * students used that never appear in the documents at all, which is usually
 * the quickest way to see what a syllabus is missing.
 */

import { terms } from './terms.js';
import { hash } from './text.js';

export type Outcome = 'answered' | 'not-found' | 'unhelpful';

export interface LogEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  question: string;
  outcome: Outcome;
  /** Question words that appear nowhere in the documents. */
  unknownTerms: string[];
  /** Where the answer pointed, as "doc title: location". */
  cited?: string[];
}

export interface LogFile {
  kind: 'where-does-it-say-log';
  v: 1;
  packId: string;
  packTitle: string;
  entries: LogEntry[];
}

export function newEntry(question: string, outcome: Outcome, unknownTerms: string[], at: Date, cited?: string[]): LogEntry {
  const iso = at.toISOString();
  const e: LogEntry = { id: hash(iso + '\uE000' + question) + at.getTime().toString(36), at: iso, question: question.trim(), outcome, unknownTerms };
  if (cited && cited.length) e.cited = cited;
  return e;
}

/** Marks a logged answer as not helpful (the student says the quote did not answer the question). */
export function markUnhelpful(entries: LogEntry[], id: string): LogEntry[] {
  return entries.map((e) => (e.id === id && e.outcome === 'answered' ? { ...e, outcome: 'unhelpful' } : e));
}

/** Validates one untrusted log file (a student's export). */
export function parseLogFile(text: string): LogFile | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Not valid JSON.' };
  }
  const o = data as Partial<LogFile> | null;
  if (!o || o.kind !== 'where-does-it-say-log' || o.v !== 1 || !Array.isArray(o.entries)) return { error: 'Not a Where Does It Say question log.' };
  const entries: LogEntry[] = [];
  for (const e of o.entries as unknown[]) {
    const r = e as Partial<LogEntry> | null;
    if (!r || typeof r.id !== 'string' || typeof r.at !== 'string' || typeof r.question !== 'string') continue;
    if (r.outcome !== 'answered' && r.outcome !== 'not-found' && r.outcome !== 'unhelpful') continue;
    if (Number.isNaN(Date.parse(r.at))) continue;
    const entry: LogEntry = {
      id: r.id.slice(0, 64),
      at: r.at,
      question: r.question.slice(0, 500),
      outcome: r.outcome,
      unknownTerms: Array.isArray(r.unknownTerms) ? r.unknownTerms.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    };
    if (Array.isArray(r.cited)) entry.cited = r.cited.filter((t): t is string => typeof t === 'string').slice(0, 5);
    entries.push(entry);
  }
  return {
    kind: 'where-does-it-say-log',
    v: 1,
    packId: typeof o.packId === 'string' ? o.packId : '',
    packTitle: typeof o.packTitle === 'string' ? o.packTitle : '',
    entries,
  };
}

/** Merges logs, dropping entries seen twice (the same export loaded again). */
export function mergeEntries(...lists: LogEntry[][]): LogEntry[] {
  const seen = new Map<string, LogEntry>();
  for (const list of lists) for (const e of list) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Monday (UTC) of the week containing a date, as YYYY-MM-DD. */
export function weekOf(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export interface Cluster {
  /** The shortest question in the group. */
  label: string;
  questions: LogEntry[];
}

/** Topic terms of a question for grouping: content stems and concepts, no numbered items. */
function topicTerms(q: string): Set<string> {
  return new Set(terms(q).filter((t) => !t.includes('#')));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Groups similar questions (greedy, by shared topic terms). Largest groups first. */
export function cluster(entries: LogEntry[], threshold = 0.34): Cluster[] {
  const groups: { terms: Set<string>; items: LogEntry[] }[] = [];
  for (const e of entries) {
    const t = topicTerms(e.question);
    let best: (typeof groups)[number] | undefined;
    let bestSim = threshold;
    for (const g of groups) {
      const s = jaccard(t, g.terms);
      if (s >= bestSim) {
        best = g;
        bestSim = s;
      }
    }
    if (best) {
      best.items.push(e);
      for (const x of t) best.terms.add(x);
    } else groups.push({ terms: new Set(t), items: [e] });
  }
  return groups
    .map((g) => ({
      label: g.items.map((e) => e.question).sort((a, b) => a.length - b.length || a.localeCompare(b))[0],
      questions: g.items,
    }))
    .sort((a, b) => b.questions.length - a.questions.length || a.label.localeCompare(b.label));
}

export interface GapReport {
  total: number;
  answered: number;
  gaps: number;
  weeks: { week: string; clusters: Cluster[]; count: number }[];
  /** Words students used that the documents never contain, with how many questions used them. */
  missingWords: { word: string; count: number }[];
}

/** Builds the instructor report from a log. */
export function gapReport(entries: LogEntry[]): GapReport {
  const gaps = entries.filter((e) => e.outcome !== 'answered');
  const byWeek = new Map<string, LogEntry[]>();
  for (const e of gaps) {
    const w = weekOf(e.at);
    byWeek.set(w, [...(byWeek.get(w) ?? []), e]);
  }
  const weeks = [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, list]) => ({ week, clusters: cluster(list), count: list.length }));
  const words = new Map<string, number>();
  for (const e of entries) for (const t of new Set(e.unknownTerms)) words.set(t, (words.get(t) ?? 0) + 1);
  const missingWords = [...words.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 30);
  return { total: entries.length, answered: entries.length - gaps.length, gaps: gaps.length, weeks, missingWords };
}

/** The report as Markdown, for pasting into notes or an issue tracker. */
export function reportMarkdown(r: GapReport, title: string): string {
  const lines = [`# Syllabus gaps: ${title}`, '', `${r.total} questions logged, ${r.answered} answered from the documents, ${r.gaps} not answered or marked unhelpful.`, ''];
  if (r.missingWords.length) {
    lines.push('## Words the documents never use', '');
    lines.push(r.missingWords.map((m) => `${m.word} (${m.count})`).join(', '), '');
  }
  for (const w of r.weeks) {
    lines.push(`## Week of ${w.week} (${w.count})`, '');
    for (const c of w.clusters) {
      const extra = c.questions.length > 1 ? ` (asked ${c.questions.length} times)` : '';
      const tag = c.questions.some((q) => q.outcome === 'unhelpful') ? ' [answer marked unhelpful]' : '';
      lines.push(`- ${c.label}${extra}${tag}`);
      for (const q of c.questions) if (q.question !== c.label) lines.push(`  - ${q.question}`);
    }
    lines.push('');
  }
  if (!r.weeks.length) lines.push('No gaps logged yet.', '');
  return lines.join('\n');
}

/** CSV of the whole log (one row per question). */
export function logCsv(entries: LogEntry[]): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['time', 'outcome', 'question', 'unknown_words', 'cited'].join(',')];
  for (const e of entries) rows.push([e.at, e.outcome, e.question, e.unknownTerms.join(' '), (e.cited ?? []).join(' | ')].map(cell).join(','));
  return rows.join('\n') + '\n';
}
