/** Shared data shapes. Everything here is plain JSON so runs can be stored and exported. */

export interface RubricRow {
  /** Stable id within one rubric: r1, r2, ... in source order. */
  id: string;
  label: string;
  points: number;
  description: string;
  /**
   * Set when the row is scored by the autograder instead of the judge.
   * An empty array means every test; otherwise test-name globs.
   */
  tests: string[] | null;
}

export interface SourceFile {
  name: string;
  content: string;
}

export interface Assignment {
  title: string;
  course: string;
  prompt: string;
  rubricText: string;
  /** Present only for programming assignments graded by pytest. */
  code: CodeSetup | null;
}

export interface CodeSetup {
  /** File the AI's code is saved as before the tests run, e.g. solution.py. */
  solutionFile: string;
  /** Starter files shown to the model and copied next to the solution. */
  starter: SourceFile[];
  /** pytest files, never shown to the model. */
  tests: SourceFile[];
}

export type StyleId = 'lazy' | 'student' | 'careful';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TestResult {
  name: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'error';
  message: string;
}

export interface TestRun {
  status: 'ok' | 'collection-error' | 'timeout' | 'no-code' | 'harness-error';
  results: TestResult[];
  log: string;
}

export interface RowScore {
  id: string;
  /** null when the row could not be scored (judge skipped it, no matching tests). */
  points: number | null;
  reason: string;
  source: 'judge' | 'tests' | 'instructor';
}

export interface Cell {
  model: string;
  style: StyleId;
  status: 'done' | 'refused' | 'error';
  error: string;
  transcript: ChatTurn[];
  output: string;
  tests: TestRun | null;
  scores: RowScore[];
}

export interface Run {
  id: string;
  createdAt: string;
  term: string;
  /** Where the outputs came from. */
  source: 'api' | 'paste' | 'demo';
  judge: string;
  assignment: Assignment;
  cells: Cell[];
  note: string;
}
