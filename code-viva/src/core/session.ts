/**
 * The student's timed text session as a small state machine. The clock is
 * injected so tests can run a whole session in microseconds. Each question can
 * get up to `maxFollowUps` follow-ups, chosen from what the combined answer so
 * far is missing.
 */

import { assess, type Missing } from './assess';
import { vivaId } from './pack';
import type { Question, QuestionTranscript, Transcript, Viva } from './types';

export type Step = { kind: 'question' | 'followup'; question: Question; index: number; prompt: string; followUps: number } | { kind: 'done' };

export class Session {
  private readonly t0: number;
  private index = 0;
  private followUps = 0;
  private finished = false;
  private timedOut = false;
  private blurs = 0;
  private readonly log: QuestionTranscript[];
  private readonly startedAt: string;

  constructor(
    readonly viva: Viva,
    private readonly now: () => number = () => Date.now(),
    private readonly restarts = 0,
  ) {
    this.t0 = now();
    this.startedAt = new Date(this.t0).toISOString();
    this.log = viva.questions.map((q) => ({ questionId: q.id, turns: [] }));
    if (viva.questions.length) this.push('question', viva.questions[0]!.prompt);
    else this.finished = true;
  }

  /** Time allowed in ms, including the accommodation multiplier. */
  get limitMs(): number {
    return Math.round(this.viva.minutes * Math.max(1, this.viva.timeMultiplier) * 60_000);
  }

  remainingMs(): number {
    return Math.max(0, this.limitMs - (this.now() - this.t0));
  }

  private push(role: 'question' | 'followup' | 'answer', text: string, pasted?: number) {
    this.log[this.index]!.turns.push({ role, text, at: this.now() - this.t0, ...(pasted ? { pasted } : {}) });
  }

  /** Ends the session if the time is up; returns true when it did. */
  tick(): boolean {
    if (!this.finished && this.remainingMs() <= 0) {
      this.finished = true;
      this.timedOut = true;
      return true;
    }
    return false;
  }

  blur(): void {
    if (!this.finished) this.blurs++;
  }

  current(): Step {
    if (this.finished) return { kind: 'done' };
    const question = this.viva.questions[this.index]!;
    const turns = this.log[this.index]!.turns;
    const last = [...turns].reverse().find((t) => t.role !== 'answer')!;
    return { kind: this.followUps ? 'followup' : 'question', question, index: this.index, prompt: last.text, followUps: this.followUps };
  }

  /** Records an answer and moves on: a follow-up if it was vague and any remain, else the next question. */
  answer(text: string, pasted = 0): Step {
    if (this.tick() || this.finished) return { kind: 'done' };
    const trimmed = text.trim();
    if (!trimmed) return this.current();
    this.push('answer', trimmed, Math.min(pasted, trimmed.length));
    const q = this.viva.questions[this.index]!;
    const combined = this.log[this.index]!.turns.filter((t) => t.role === 'answer').map((t) => t.text).join('\n');
    const a = assess(q, combined);
    if (a.vague && a.missing && this.followUps < this.viva.maxFollowUps) {
      // Never repeat a follow-up: if this gap was already asked about, ask the next kind instead.
      const asked = new Set(this.log[this.index]!.turns.filter((t) => t.role === 'followup').map((t) => t.text));
      const order: Missing[] = [a.missing, 'concept', 'depth', 'specifics'];
      const kind = order.find((k) => !asked.has(q.followUps[k]));
      if (kind) {
        this.followUps++;
        this.push('followup', q.followUps[kind]);
        return this.current();
      }
    }
    return this.next();
  }

  /** Moves past the current question without (further) answering it. */
  skip(): Step {
    if (this.tick() || this.finished) return { kind: 'done' };
    return this.next();
  }

  private next(): Step {
    this.followUps = 0;
    this.index++;
    if (this.index >= this.viva.questions.length) {
      this.finished = true;
      this.index = this.viva.questions.length - 1;
      return { kind: 'done' };
    }
    this.push('question', this.viva.questions[this.index]!.prompt);
    return this.current();
  }

  /** Ends the session early (the student chose to submit). */
  finish(): void {
    this.tick();
    this.finished = true;
  }

  get done(): boolean {
    return this.finished;
  }

  transcript(): Transcript {
    return {
      v: 1,
      vivaId: vivaId(this.viva),
      student: this.viva.student,
      submissionId: this.viva.submissionId,
      startedAt: this.startedAt,
      durationMs: Math.min(this.now() - this.t0, this.limitMs),
      timedOut: this.timedOut,
      blurs: this.blurs,
      ...(this.restarts ? { restarts: this.restarts } : {}),
      questions: this.log.map((q) => ({ questionId: q.questionId, turns: q.turns.map((t) => ({ ...t })) })),
    };
  }
}
