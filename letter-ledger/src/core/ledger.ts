/**
 * The professor's ledger: students (with notes), and the requests they sent.
 * All functions are pure and return a new ledger, so the UI can save after
 * every change and tests can check each step.
 */

import { daysBetween, termKey } from './dates';
import { newId } from './codec';
import type { CourseTaken, Ledger, LedgerRequest, Note, NoteTag, Program, ProgramState, ProgramStatus, RequestPacket, Student } from './types';
import { STATUS_LABELS } from './types';

export function emptyLedger(): Ledger {
  return { v: 1, students: [], requests: [] };
}

export function parseLedger(json: string): Ledger | null {
  try {
    const l = JSON.parse(json) as Ledger;
    if (l?.v !== 1 || !Array.isArray(l.students) || !Array.isArray(l.requests)) return null;
    if (!l.students.every((s) => typeof s?.id === 'string' && Array.isArray(s.notes))) return null;
    if (!l.requests.every((r) => typeof r?.studentId === 'string' && !!r.packet && !!r.programs)) return null;
    for (const s of l.students) s.courses ??= [];
    return l;
  } catch {
    return null;
  }
}

const key = (s: string) => s.trim().toLowerCase();

export function findStudentByEmail(l: Ledger, email: string): Student | undefined {
  return key(email) ? l.students.find((s) => key(s.email) === key(email)) : undefined;
}

export function student(l: Ledger, id: string): Student | undefined {
  return l.students.find((s) => s.id === id);
}

export function addStudent(l: Ledger, name: string, email = '', id = newId()): { ledger: Ledger; student: Student } {
  const existing = findStudentByEmail(l, email);
  if (existing) return { ledger: l, student: existing };
  const s: Student = { id, name: name.trim(), email: email.trim(), notes: [], courses: [] };
  return { ledger: { ...l, students: [...l.students, s] }, student: s };
}

export function updateStudent(l: Ledger, id: string, patch: Partial<Pick<Student, 'name' | 'email' | 'courses'>>): Ledger {
  return { ...l, students: l.students.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export type AddResult = { ledger: Ledger; status: 'added' | 'duplicate'; request: LedgerRequest };

/** Files a packet under its student (matched by email, created if new). A packet already filed is reported, not doubled. */
export function addPacket(l: Ledger, packet: RequestPacket, today: string): AddResult {
  const dup = l.requests.find((r) => r.packet.id === packet.id);
  if (dup) return { ledger: l, status: 'duplicate', request: dup };
  const { ledger, student: s } = addStudent(l, packet.student.name, packet.student.email);
  const programs: Record<string, ProgramState> = {};
  for (const p of packet.programs) programs[p.id] = { status: 'new', notes: '' };
  const request: LedgerRequest = { packet, studentId: s.id, receivedOn: today, programs };
  return { ledger: { ...ledger, requests: [...ledger.requests, request] }, status: 'added', request };
}

function mapRequest(l: Ledger, requestId: string, fn: (r: LedgerRequest) => LedgerRequest): Ledger {
  return { ...l, requests: l.requests.map((r) => (r.packet.id === requestId ? fn(r) : r)) };
}

function mapProgram(l: Ledger, requestId: string, programId: string, fn: (p: ProgramState) => ProgramState): Ledger {
  return mapRequest(l, requestId, (r) => (r.programs[programId] ? { ...r, programs: { ...r.programs, [programId]: fn(r.programs[programId]!) } } : r));
}

export function setStatus(l: Ledger, requestId: string, programId: string, status: ProgramStatus, today: string): Ledger {
  return mapProgram(l, requestId, programId, (p) => ({ ...p, status, submittedOn: status === 'submitted' ? (p.submittedOn ?? today) : undefined }));
}

/** Sets every still-open program of a request (accept or decline the whole request at once). */
export function setAllStatus(l: Ledger, requestId: string, status: ProgramStatus, today: string): Ledger {
  const r = l.requests.find((x) => x.packet.id === requestId);
  if (!r) return l;
  return Object.entries(r.programs).reduce((acc, [pid, st]) => (st.status === 'submitted' ? acc : setStatus(acc, requestId, pid, status, today)), l);
}

export function setProgramNotes(l: Ledger, requestId: string, programId: string, notes: string): Ledger {
  return mapProgram(l, requestId, programId, (p) => ({ ...p, notes }));
}

/** Records that the student has been told the current status of each program. */
export function markNotified(l: Ledger, requestId: string): Ledger {
  return mapRequest(l, requestId, (r) => ({ ...r, programs: Object.fromEntries(Object.entries(r.programs).map(([k, p]) => [k, { ...p, notifiedStatus: p.status }])) }));
}

/** True when some program's status changed since the student was last told. */
export function needsNotice(r: LedgerRequest): boolean {
  return Object.values(r.programs).some((p) => p.status !== 'new' && p.notifiedStatus !== p.status);
}

export function addNote(l: Ledger, studentId: string, note: Omit<Note, 'id'>, id = newId()): Ledger {
  const n: Note = { ...note, id, text: note.text.trim() };
  if (!n.text) return l;
  return { ...l, students: l.students.map((s) => (s.id === studentId ? { ...s, notes: [...s.notes, n].sort(byDate) } : s)) };
}

const byDate = (a: Note, b: Note) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function deleteNote(l: Ledger, studentId: string, noteId: string): Ledger {
  return { ...l, students: l.students.map((s) => (s.id === studentId ? { ...s, notes: s.notes.filter((n) => n.id !== noteId) } : s)) };
}

export function deleteRequest(l: Ledger, requestId: string): Ledger {
  return { ...l, requests: l.requests.filter((r) => r.packet.id !== requestId) };
}

/** Removes a student and every request and note about them (a deletion request). Returns the attachment keys to purge. */
export function deleteStudent(l: Ledger, studentId: string): { ledger: Ledger; attachmentKeys: string[] } {
  const gone = l.requests.filter((r) => r.studentId === studentId);
  return {
    ledger: { ...l, students: l.students.filter((s) => s.id !== studentId), requests: l.requests.filter((r) => r.studentId !== studentId) },
    attachmentKeys: gone.flatMap((r) => r.packet.attachments.map((a) => attachmentKey(r.packet.id, a.id))),
  };
}

export const attachmentKey = (requestId: string, attachmentId: string) => `${requestId}/${attachmentId}`;

/** Every course the professor knows this student from: their own roster entries plus every request, deduplicated, oldest first. */
export function coursesFor(l: Ledger, studentId: string): CourseTaken[] {
  const s = student(l, studentId);
  const all = [...(s?.courses ?? []), ...l.requests.filter((r) => r.studentId === studentId).flatMap((r) => r.packet.courses)];
  const seen = new Map<string, CourseTaken>();
  for (const c of all) {
    const k = `${key(c.code || c.title)}|${key(c.term)}`;
    if (!seen.has(k)) seen.set(k, c);
  }
  return [...seen.values()].sort((a, b) => (termKey(a.term) ?? 0) - (termKey(b.term) ?? 0));
}

export type Urgency = 'overdue' | 'due-soon' | 'upcoming' | 'closed';

export interface DeadlineRow {
  request: LedgerRequest;
  program: Program;
  state: ProgramState;
  student: Student | undefined;
  daysLeft: number;
  urgency: Urgency;
}

export const DUE_SOON_DAYS = 7;

export function isOpen(status: ProgramStatus): boolean {
  return status !== 'submitted' && status !== 'declined';
}

/** One row per program across all requests: open letters by deadline first, then closed ones (most recent deadline first). */
export function deadlines(l: Ledger, today: string): DeadlineRow[] {
  const rows: DeadlineRow[] = [];
  for (const r of l.requests) {
    for (const p of r.packet.programs) {
      const state = r.programs[p.id] ?? { status: 'new' as const, notes: '' };
      const daysLeft = daysBetween(today, p.deadline);
      const urgency: Urgency = !isOpen(state.status) ? 'closed' : daysLeft < 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'due-soon' : 'upcoming';
      rows.push({ request: r, program: p, state, student: student(l, r.studentId), daysLeft, urgency });
    }
  }
  return rows.sort((a, b) => {
    const ca = a.urgency === 'closed' ? 1 : 0;
    const cb = b.urgency === 'closed' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return ca ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft;
  });
}

export interface Stats {
  open: number;
  dueSoon: number;
  overdue: number;
  submitted: number;
  newRequests: number;
  students: number;
}

export function stats(l: Ledger, today: string): Stats {
  const rows = deadlines(l, today);
  return {
    open: rows.filter((r) => r.urgency !== 'closed').length,
    dueSoon: rows.filter((r) => r.urgency === 'due-soon').length,
    overdue: rows.filter((r) => r.urgency === 'overdue').length,
    submitted: rows.filter((r) => r.state.status === 'submitted').length,
    newRequests: l.requests.filter((r) => Object.values(r.programs).some((p) => p.status === 'new')).length,
    students: l.students.length,
  };
}

function csvCell(v: string | number): string {
  if (typeof v === 'number') return String(v);
  const s = v;
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
}

/** Spreadsheet of every program row (cells that look like formulas are defused). */
export function deadlinesCsv(l: Ledger, today: string): string {
  const head = ['student', 'email', 'program', 'kind', 'deadline', 'days_left', 'status', 'submitted_on', 'method', 'url'];
  const lines = deadlines(l, today).map((r) =>
    [r.student?.name ?? r.request.packet.student.name, r.request.packet.student.email, r.program.name, r.program.kind, r.program.deadline, r.daysLeft, STATUS_LABELS[r.state.status], r.state.submittedOn ?? '', r.program.method, r.program.url].map(csvCell).join(','),
  );
  return [head.join(','), ...lines].join('\n') + '\n';
}

/** Quick capture: "Ada Lovelace: great question on hashing" or "ada@uw.edu - ...". Returns null if there is no separator. */
export function parseQuickNote(line: string): { who: string; text: string; tag: NoteTag | null } | null {
  const m = /^\s*(.+?)\s*(?::|\s[-\u2013\u2014]\s)\s*(.+)$/.exec(line);
  if (!m) return null;
  let text = m[2]!.trim();
  let tag: NoteTag | null = null;
  const t = /\s#(class|office-hours|oh|project|research|ta|other)\b/i.exec(` ${text}`);
  if (t) {
    const raw = t[1]!.toLowerCase();
    tag = (raw === 'oh' ? 'office-hours' : raw) as NoteTag;
    text = ` ${text}`.replace(t[0], '').trim();
  }
  return text ? { who: m[1]!.trim(), text, tag } : null;
}

/** Matches a quick-capture name or email to one student, or null when none or several match. */
export function matchStudent(l: Ledger, who: string): Student | null {
  const w = key(who);
  if (!w) return null;
  const byEmail = l.students.filter((s) => key(s.email) === w);
  if (byEmail.length === 1) return byEmail[0]!;
  const byName = l.students.filter((s) => key(s.name) === w);
  if (byName.length === 1) return byName[0]!;
  const partial = l.students.filter((s) => key(s.name).split(/\s+/).some((part) => part === w) || key(s.name).startsWith(w));
  return partial.length === 1 ? partial[0]! : null;
}
