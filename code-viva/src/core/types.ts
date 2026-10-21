/** Shared data shapes. Everything here is plain JSON so it can travel in links and exports. */

export interface SourceFile {
  path: string;
  text: string;
}

export interface Commit {
  sha: string;
  author: string;
  /** ISO 8601 with the committer's UTC offset, e.g. 2026-10-02T02:47:10-07:00. */
  date: string;
  message: string;
  added: number;
  deleted: number;
  /** Files touched, with per-file added line counts when known. */
  files: { path: string; added: number }[];
}

export interface Submission {
  /** Stable id inside a course (folder or repo name). */
  id: string;
  student: string;
  files: SourceFile[];
  commits: Commit[];
}

export type QuestionKind = 'trace' | 'edge' | 'design' | 'recursion' | 'naming' | 'commit' | 'scale' | 'spec';

export interface Anchor {
  file: string;
  /** 1-based first line of the snippet. */
  line: number;
  snippet: string;
  /** Highlighted line inside the snippet (1-based file line), if any. */
  focus?: number;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  anchor: Anchor | null;
  /** Identifiers a specific answer is expected to mention. */
  identifiers: string[];
  /** Concept keyword groups; an answer covers a group when it mentions any word in it. */
  concepts: string[][];
  /** Follow-up prompts keyed by what the answer was missing. */
  followUps: { specifics: string; concept: string; depth: string };
}

export interface Viva {
  v: 1;
  course: string;
  assignment: string;
  student: string;
  submissionId: string;
  /** Total time for the session in minutes (before any accommodation multiplier). */
  minutes: number;
  /** Extended-time multiplier for accommodations, e.g. 1.5. */
  timeMultiplier: number;
  maxFollowUps: number;
  questions: Question[];
}

export interface Turn {
  role: 'question' | 'followup' | 'answer';
  text: string;
  /** Milliseconds since the session started. */
  at: number;
  /** Characters that arrived by paste in this answer. */
  pasted?: number;
}

export interface QuestionTranscript {
  questionId: string;
  turns: Turn[];
}

export interface Transcript {
  v: 1;
  vivaId: string;
  student: string;
  submissionId: string;
  startedAt: string;
  durationMs: number;
  timedOut: boolean;
  /** Times the page lost focus during the session. */
  blurs: number;
  /** Times the student reloaded and restarted the session before finishing. */
  restarts?: number;
  questions: QuestionTranscript[];
}
