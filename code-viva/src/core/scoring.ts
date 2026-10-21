/**
 * Proposed scores and flags. Every proposed score cites the sentences it rests
 * on, quoted verbatim from the transcript, and nothing here is final: the
 * instructor approves or overrides each score before anything is released.
 *
 * Rubric per question (0 to 3):
 *   +1 specific: names the student's own identifiers, a line, or quoted code
 *   +1 concepts: covers at least half of the concept groups the question asks about
 *   +1 explains: at least 30 words with a causal link ("because", "so that", ...)
 * An answer that is mostly "I don't know" (under 20 words) scores 0. Replies that
 * are mostly pasted are shown but not credited.
 */

import { assess, type Assessment } from './assess';
import { coversConcept, mentions, sentences, words } from './text';
import type { Question, QuestionTranscript, Transcript, Viva } from './types';

export const RUBRIC = [
  'No evidence of understanding: no answer, or "I don\'t know".',
  'General: talks about the topic, not about this code.',
  'Specific but incomplete: refers to the student\'s own code but misses part of the question.',
  'Specific and complete: refers to the code, covers the question, and explains why.',
];

export interface QuestionScore {
  questionId: string;
  score: number;
  answered: boolean;
  evidence: string[];
  notes: string[];
  followUps: number;
  pastedShare: number;
  /** Words across every reply, pasted ones included. */
  answerWords: number;
  /** Words per minute of typed (not pasted) text across the answers. */
  wpm: number | null;
  assessment: Assessment;
}

export type FlagKind = 'low-score' | 'zero' | 'paste' | 'commit-unexplained' | 'timeout' | 'focus' | 'fast' | 'mismatch' | 'restart';

export interface Flag {
  kind: FlagKind;
  severity: 1 | 2 | 3;
  message: string;
}

export interface VivaScore {
  questions: QuestionScore[];
  total: number;
  max: number;
  percent: number;
  flags: Flag[];
  /** Sum of flag severities; the flag queue is ordered by this. */
  priority: number;
  needsFollowUp: boolean;
}

function clip(s: string, n = 220): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

function evidenceFor(q: Question, answers: string[]): string[] {
  const all = answers.flatMap(sentences);
  const weight = (s: string) => q.identifiers.filter((id) => mentions(s, id)).length * 2 + q.concepts.filter((g) => coversConcept(s, g)).length;
  return all
    .map((s, i) => ({ s, i, w: weight(s) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map((x) => clip(x.s));
}

export function scoreQuestion(q: Question, qt: QuestionTranscript | undefined): QuestionScore {
  const turns = qt?.turns ?? [];
  const answers = turns.filter((t) => t.role === 'answer');
  // A mostly pasted answer is shown to the instructor but earns no credit: it is not the student's explanation.
  const own = answers.filter((t) => (t.pasted ?? 0) < t.text.length / 2);
  const text = own.map((t) => t.text).join('\n');
  const a = assess(q, text);
  const followUps = turns.filter((t) => t.role === 'followup').length;
  const chars = answers.reduce((s, t) => s + t.text.length, 0);
  const pasted = answers.reduce((s, t) => s + (t.pasted ?? 0), 0);
  let typedMs = 0;
  let typedWords = 0;
  turns.forEach((t, i) => {
    if (t.role !== 'answer' || i === 0) return;
    const typed = t.text.length - (t.pasted ?? 0);
    if (typed <= 0) return;
    typedMs += t.at - turns[i - 1]!.at;
    typedWords += (typed / t.text.length) * t.text.split(/\s+/).filter(Boolean).length;
  });
  const notes: string[] = [];
  if (!answers.length) {
    return { questionId: q.id, score: 0, answered: false, evidence: [], notes: ['Not answered.'], followUps, pastedShare: 0, answerWords: 0, wpm: null, assessment: a };
  }
  const covered = a.concepts.filter(Boolean).length;
  let score = (a.specific && q.identifiers.length ? 1 : a.pointsAtCode ? 1 : 0) + (covered * 2 >= a.concepts.length ? 1 : 0) + (a.words >= 30 && a.causal ? 1 : 0);
  if (q.identifiers.length === 0 && !a.pointsAtCode && covered > 0) score += 1;
  if ((a.dontKnow && a.words < 20) || !own.length) score = 0;
  score = Math.min(3, score);
  if (a.identifiersHit.length) notes.push(`Names ${a.identifiersHit.map((x) => `\`${x}\``).join(', ')}.`);
  else if (q.identifiers.length) notes.push(`Does not name ${q.identifiers.slice(0, 3).map((x) => `\`${x}\``).join(', ')}.`);
  if (covered < a.concepts.length) notes.push(`Misses: ${q.concepts.filter((_, i) => !a.concepts[i]).map((g) => g[0]).join('; ')}.`);
  if (!a.causal) notes.push('States what happens without saying why.');
  if (a.dontKnow) notes.push('Says they do not know or remember.');
  if (followUps) notes.push(`Needed ${followUps} follow-up${followUps > 1 ? 's' : ''}.`);
  const pastedShare = chars ? pasted / chars : 0;
  if (pastedShare >= 0.3) notes.push(`${Math.round(pastedShare * 100)}% of this answer was pasted.`);
  if (own.length < answers.length) notes.push(`${answers.length - own.length === answers.length ? 'The answer was' : `${answers.length - own.length} of ${answers.length} replies were`} mostly pasted and not credited.`);
  const wpm = typedMs > 0 ? typedWords / (typedMs / 60_000) : null;
  return { questionId: q.id, score, answered: true, evidence: evidenceFor(q, own.map((t) => t.text)), notes, followUps, pastedShare, answerWords: words(answers.map((t) => t.text).join(' ')).length, wpm, assessment: a };
}

/**
 * Scores a whole transcript and raises flags. Flags are reasons to spend a few
 * minutes of human follow-up, not findings of misconduct.
 */
export function scoreViva(viva: Viva, t: Transcript, expectedId?: string): VivaScore {
  const byId = new Map(t.questions.map((q) => [q.questionId, q]));
  const questions = viva.questions.map((q) => scoreQuestion(q, byId.get(q.id)));
  const total = questions.reduce((s, q) => s + q.score, 0);
  const max = questions.length * 3;
  const percent = max ? total / max : 0;
  const flags: Flag[] = [];
  if (expectedId && expectedId !== t.vivaId) flags.push({ kind: 'mismatch', severity: 3, message: 'This transcript answers a different version of the questions than the one issued.' });
  if (percent < 0.5) flags.push({ kind: 'low-score', severity: percent < 0.34 ? 3 : 2, message: `Proposed score ${Math.round(percent * 100)}% is under 50%.` });
  const zeros = questions.filter((q) => q.answered && q.score === 0).length;
  if (zeros) flags.push({ kind: 'zero', severity: 2, message: `${zeros} answered question${zeros > 1 ? 's' : ''} scored 0.` });
  const allWords = questions.reduce((s, q) => s + q.answerWords, 0);
  const pastedWords = questions.reduce((s, q) => s + q.pastedShare * q.answerWords, 0);
  if (allWords >= 30 && pastedWords / allWords >= 0.5) flags.push({ kind: 'paste', severity: 2, message: `${Math.round((100 * pastedWords) / allWords)}% of the answer text was pasted rather than typed.` });
  viva.questions.forEach((q, i) => {
    if (q.kind === 'commit' && questions[i]!.score <= 1) flags.push({ kind: 'commit-unexplained', severity: 3, message: `The commit question scored ${questions[i]!.score}/3: the flagged commit is not explained.` });
  });
  const unanswered = questions.filter((q) => !q.answered).length;
  if (t.timedOut && unanswered) flags.push({ kind: 'timeout', severity: 1, message: `Time ran out with ${unanswered} question${unanswered > 1 ? 's' : ''} unanswered.` });
  if (t.restarts) flags.push({ kind: 'restart', severity: 1, message: `Restarted the session ${t.restarts} time${t.restarts > 1 ? 's' : ''} after seeing questions.` });
  if (t.blurs >= 3) flags.push({ kind: 'focus', severity: 1, message: `Left the session window ${t.blurs} times.` });
  const fast = questions.filter((q) => q.wpm !== null && q.wpm > 120 && q.assessment.words >= 30);
  if (fast.length) flags.push({ kind: 'fast', severity: 1, message: `Typed faster than 120 words per minute on ${fast.length} answer${fast.length > 1 ? 's' : ''}.` });
  flags.sort((a, b) => b.severity - a.severity);
  const priority = flags.reduce((s, f) => s + f.severity, 0);
  return { questions, total, max, percent, flags, priority, needsFollowUp: flags.some((f) => f.severity >= 2) || percent < 0.6 };
}
