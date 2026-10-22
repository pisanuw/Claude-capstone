/** Shared shapes. Dates are local calendar days as `YYYY-MM-DD`; times are ISO strings. */

export type DocKind = 'cv' | 'statement' | 'transcript' | 'photo' | 'other';

export const DOC_LABELS: Record<DocKind, string> = {
  cv: 'CV or resume',
  statement: 'Statement of purpose or personal statement',
  transcript: 'Unofficial transcript',
  photo: 'Photo (helps me put a face to the name)',
  other: 'Other document',
};

/** What the professor publishes in their request link. */
export interface Policy {
  v: 1;
  professor: string;
  title: string;
  institution: string;
  email: string;
  /** Minimum calendar days between the request and the earliest deadline. */
  leadDays: number;
  maxPrograms: number;
  /** Grades at or above this one count as meeting the course requirement (empty: no grade rule). */
  minGrade: string;
  /** How many of the student's courses with this professor must meet `minGrade`. */
  minCourses: number;
  requiredDocs: DocKind[];
  /** Free-text conditions shown to the student before they start. */
  conditions: string;
  /** Extra questions the professor wants answered; each becomes a required text box. */
  questions: string[];
  /** ECDH P-256 public key (raw, base64url) that every packet is encrypted to. */
  publicKey: string;
}

export interface Program {
  id: string;
  name: string;
  /** e.g. "PhD", "MS", "Internship", "Scholarship". */
  kind: string;
  url: string;
  deadline: string;
  /** How the letter is submitted: "portal link by email", "email to ...", "Interfolio". */
  method: string;
  /** What this program emphasizes, or why the student is applying. */
  tailoring: string;
}

export interface CourseTaken {
  code: string;
  title: string;
  term: string;
  grade: string;
  /** "student", "TA", "research assistant", ... */
  role: string;
}

export interface Attachment {
  id: string;
  kind: DocKind;
  name: string;
  type: string;
  size: number;
  /** base64 (standard) of the file bytes; dropped from the ledger once stored in IndexedDB. */
  data?: string;
}

/**
 * The student's FERPA release (34 CFR 99.30: signed and dated, naming the
 * records, the purpose and the parties). The text the student agreed to is
 * kept verbatim with a hash so it can be shown later exactly as signed.
 */
export interface Release {
  consent: boolean;
  /** Record categories the student allows the letter to discuss. */
  scope: ReleaseScope[];
  /** True if the student waives the right to read the letter. */
  waive: boolean;
  signature: string;
  signedAt: string;
  text: string;
  textHash: string;
}

export type ReleaseScope = 'grades' | 'performance' | 'conduct' | 'transcript';

export const SCOPE_LABELS: Record<ReleaseScope, string> = {
  grades: 'my grades and class rank in your courses',
  performance: 'my performance in your courses (assignments, exams, projects, participation)',
  conduct: 'my conduct, character and interactions with you',
  transcript: 'information from the transcript I attach',
};

export interface RequestPacket {
  v: 1;
  id: string;
  createdAt: string;
  student: {
    name: string;
    email: string;
    studentId: string;
    pronouns: string;
    /** How the professor knows them, in the student's words. */
    howKnown: string;
  };
  programs: Program[];
  courses: CourseTaken[];
  highlights: string;
  answers: string[];
  attachments: Attachment[];
  release: Release;
  /** The policy questions the answers line up with, copied at submission time. */
  questions: string[];
}

export type ProgramStatus = 'new' | 'accepted' | 'declined' | 'drafting' | 'submitted';

export const STATUS_LABELS: Record<ProgramStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  declined: 'Declined',
  drafting: 'Drafting',
  submitted: 'Submitted',
};

export interface ProgramState {
  status: ProgramStatus;
  /** When the last status email was prepared for the student. */
  notifiedStatus?: ProgramStatus;
  submittedOn?: string;
  /** Professor's own tailoring notes for this program. */
  notes: string;
}

export type NoteTag = 'class' | 'office-hours' | 'project' | 'research' | 'ta' | 'other';

export const TAG_LABELS: Record<NoteTag, string> = {
  class: 'In class',
  'office-hours': 'Office hours',
  project: 'Project or assignment',
  research: 'Research',
  ta: 'Teaching assistant',
  other: 'Other',
};

export interface Note {
  id: string;
  date: string;
  tag: NoteTag;
  course: string;
  text: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  notes: Note[];
  /** Courses the professor recorded themselves (from a roster), merged with requested ones. */
  courses: CourseTaken[];
}

export interface LedgerRequest {
  packet: RequestPacket;
  studentId: string;
  receivedOn: string;
  programs: Record<string, ProgramState>;
}

export interface Ledger {
  v: 1;
  students: Student[];
  requests: LedgerRequest[];
}
