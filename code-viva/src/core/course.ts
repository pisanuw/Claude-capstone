/**
 * The instructor's course: submissions, the vivas issued for them, the
 * transcripts that came back, and the instructor's decisions. Plain JSON so it
 * can live in localStorage and be exported or handed to a co-instructor.
 */

import { commitStats } from './commits';
import { vivaId } from './pack';
import { generateQuestions } from './questions';
import { scoreViva, type VivaScore } from './scoring';
import type { Question, Submission, Transcript, Viva } from './types';

export interface Review {
  /** Instructor scores per question id, overriding the proposal. */
  scores: Record<string, number>;
  approved: boolean;
  note: string;
}

export interface Settings {
  course: string;
  assignment: string;
  spec: string;
  minutes: number;
  questions: number;
  maxFollowUps: number;
  deadline: string;
}

export interface Course {
  v: 1;
  settings: Settings;
  submissions: Submission[];
  vivas: Record<string, Viva>;
  /** Per student, the time multiplier for accommodations (default 1). */
  accommodations: Record<string, number>;
  transcripts: Record<string, Transcript>;
  reviews: Record<string, Review>;
}

export const DEFAULT_SETTINGS: Settings = { course: '', assignment: '', spec: '', minutes: 20, questions: 5, maxFollowUps: 2, deadline: '' };

export function emptyCourse(settings: Partial<Settings> = {}): Course {
  return { v: 1, settings: { ...DEFAULT_SETTINGS, ...settings }, submissions: [], vivas: {}, accommodations: {}, transcripts: {}, reviews: {} };
}

export function makeViva(c: Course, sub: Submission, questions?: Question[]): Viva {
  const s = c.settings;
  return {
    v: 1,
    course: s.course,
    assignment: s.assignment,
    student: sub.student,
    submissionId: sub.id,
    minutes: s.minutes,
    timeMultiplier: c.accommodations[sub.id] ?? 1,
    maxFollowUps: s.maxFollowUps,
    questions: questions ?? generateQuestions(sub, { spec: s.spec, count: s.questions, ...(s.deadline ? { deadline: s.deadline } : {}) }),
  };
}

/** (Re)generates vivas. Students who already answered keep the viva they answered. */
export function generateAll(c: Course, only?: string[]): Course {
  const vivas = { ...c.vivas };
  for (const sub of c.submissions) {
    if (only && !only.includes(sub.id)) continue;
    if (c.transcripts[sub.id]) continue;
    vivas[sub.id] = makeViva(c, sub);
  }
  return { ...c, vivas };
}

/** Changes timing or accommodation on an issued viva without regenerating its questions (the link changes). */
export function retime(c: Course, id: string): Course {
  const v = c.vivas[id];
  const sub = c.submissions.find((s) => s.id === id);
  if (!v || !sub) return c;
  return { ...c, vivas: { ...c.vivas, [id]: makeViva(c, sub, v.questions) } };
}

export function replaceQuestion(c: Course, id: string, index: number, q: Question): Course {
  const v = c.vivas[id];
  if (!v || !v.questions[index]) return c;
  const questions = v.questions.map((x, i) => (i === index ? q : x));
  return { ...c, vivas: { ...c.vivas, [id]: { ...v, questions } } };
}

export type AcceptResult = { ok: true; course: Course; student: string; mismatch: boolean } | { ok: false; error: string };

/** Files a transcript under its submission. A transcript whose viva id does not match the issued viva is kept but flagged. */
export function acceptTranscript(c: Course, t: Transcript): AcceptResult {
  const v = c.vivas[t.submissionId];
  if (!v) return { ok: false, error: `No viva was issued for submission "${t.submissionId}" (${t.student}).` };
  const mismatch = vivaId(v) !== t.vivaId;
  return { ok: true, course: { ...c, transcripts: { ...c.transcripts, [t.submissionId]: t } }, student: v.student, mismatch };
}

export type Status = 'no viva' | 'not answered' | 'to review' | 'approved';

export interface Row {
  id: string;
  student: string;
  status: Status;
  commits: number;
  commitEvents: number;
  score: VivaScore | null;
  /** Final percentage after instructor overrides, when a transcript exists. */
  final: number | null;
}

export function finalScores(v: Viva, s: VivaScore, r: Review | undefined): number[] {
  return v.questions.map((q, i) => r?.scores[q.id] ?? s.questions[i]!.score);
}

export function rows(c: Course): Row[] {
  return c.submissions.map((sub) => {
    const v = c.vivas[sub.id];
    const t = c.transcripts[sub.id];
    const r = c.reviews[sub.id];
    const stats = commitStats(sub.commits, c.settings.deadline || undefined);
    const score = v && t ? scoreViva(v, t, vivaId(v)) : null;
    const final = v && score ? finalScores(v, score, r).reduce((a, b) => a + b, 0) / Math.max(1, score.max) : null;
    const status: Status = !v ? 'no viva' : !t ? 'not answered' : r?.approved ? 'approved' : 'to review';
    return { id: sub.id, student: sub.student, status, commits: stats.count, commitEvents: stats.events.length, score, final };
  });
}

/** Students to see in person, most urgent first: answered, not yet approved, and flagged. */
export function flagQueue(c: Course): Row[] {
  return rows(c)
    .filter((r) => r.score && r.status === 'to review' && r.score.needsFollowUp)
    .sort((a, b) => b.score!.priority - a.score!.priority || a.score!.percent - b.score!.percent);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: (string | number)[][]): string {
  return table.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Results export: one row per student with proposed and final scores and flags. */
export function resultsCsv(c: Course): string {
  const head = ['submission', 'student', 'status', 'proposed_pct', 'final_pct', 'approved', 'flags', 'note'];
  const body = rows(c).map((r) => [
    r.id,
    r.student,
    r.status,
    r.score ? Math.round(r.score.percent * 100) : '',
    r.final !== null ? Math.round(r.final * 100) : '',
    c.reviews[r.id]?.approved ? 'yes' : 'no',
    r.score ? r.score.flags.map((f) => f.kind).join(' ') : '',
    c.reviews[r.id]?.note ?? '',
  ]);
  return toCsv([head, ...body]);
}

/** Links export for mail merge or an LMS announcement. */
export function linksCsv(c: Course, link: (v: Viva) => string): string {
  const body = c.submissions.filter((s) => c.vivas[s.id]).map((s) => [s.id, s.student, String(c.vivas[s.id]!.timeMultiplier), link(c.vivas[s.id]!)]);
  return toCsv([['submission', 'student', 'time_multiplier', 'link'], ...body]);
}

/** Validates an imported course file. */
export function parseCourse(json: string): Course | null {
  try {
    const c = JSON.parse(json) as Course;
    if (c?.v !== 1 || !Array.isArray(c.submissions) || typeof c.vivas !== 'object' || !c.settings) return null;
    return { ...emptyCourse(c.settings), ...c, settings: { ...DEFAULT_SETTINGS, ...c.settings } };
  } catch {
    return null;
  }
}
