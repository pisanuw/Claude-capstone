import { describe, expect, it } from 'vitest';
import {
  addNote,
  addPacket,
  addStudent,
  coursesFor,
  deadlines,
  deadlinesCsv,
  deleteNote,
  deleteRequest,
  deleteStudent,
  emptyLedger,
  markNotified,
  matchStudent,
  needsNotice,
  parseLedger,
  parseQuickNote,
  setAllStatus,
  setProgramNotes,
  setStatus,
  stats,
  updateStudent,
} from '../src/core/ledger';
import type { Program } from '../src/core/types';
import { packet, TODAY } from './fixtures';

const prog = (id: string, deadline: string, name = id): Program => ({ id, name, kind: '', url: '', deadline, method: 'email', tailoring: '' });

describe('filing packets', () => {
  it('creates the student once and reports duplicates', async () => {
    const p = await packet();
    const a = addPacket(emptyLedger(), p, TODAY);
    expect(a.status).toBe('added');
    expect(a.ledger.students).toHaveLength(1);
    expect(a.request.programs.p1).toEqual({ status: 'new', notes: '' });
    const b = addPacket(a.ledger, p, TODAY);
    expect(b.status).toBe('duplicate');
    expect(b.ledger).toBe(a.ledger);
    const c = addPacket(a.ledger, { ...p, id: 'req2', student: { ...p.student, email: 'ADA@test.edu ' } }, TODAY);
    expect(c.ledger.students).toHaveLength(1);
    expect(c.ledger.requests).toHaveLength(2);
  });

  it('files under a student the professor already added during the term', async () => {
    const { ledger, student } = addStudent(emptyLedger(), 'Ada', 'ada@test.edu', 's1');
    expect(addStudent(ledger, 'Other', 'ADA@test.edu').student).toBe(student);
    const a = addPacket(ledger, await packet(), TODAY);
    expect(a.request.studentId).toBe('s1');
    expect(addStudent(ledger, 'No email').ledger.students).toHaveLength(2);
  });
});

describe('statuses and notes', () => {
  it('tracks status, submission day and notices', async () => {
    let l = addPacket(emptyLedger(), await packet({ programs: [prog('p1', '2026-11-01'), prog('p2', '2026-12-01')] }), TODAY).ledger;
    expect(needsNotice(l.requests[0]!)).toBe(false);
    l = setStatus(l, 'req1', 'p1', 'submitted', '2026-10-25');
    l = setStatus(l, 'req1', 'p1', 'submitted', '2026-10-30');
    expect(l.requests[0]!.programs.p1!.submittedOn).toBe('2026-10-25');
    expect(needsNotice(l.requests[0]!)).toBe(true);
    l = markNotified(l, 'req1');
    expect(needsNotice(l.requests[0]!)).toBe(false);
    l = setAllStatus(l, 'req1', 'declined', TODAY);
    expect(l.requests[0]!.programs.p1!.status).toBe('submitted');
    expect(l.requests[0]!.programs.p2!.status).toBe('declined');
    l = setStatus(l, 'req1', 'p1', 'drafting', TODAY);
    expect(l.requests[0]!.programs.p1!.submittedOn).toBeUndefined();
    expect(setAllStatus(l, 'nope', 'accepted', TODAY)).toBe(l);
    expect(setStatus(l, 'req1', 'missing', 'accepted', TODAY).requests[0]).toEqual(l.requests[0]);
    l = setProgramNotes(l, 'req1', 'p2', 'Mention X');
    expect(l.requests[0]!.programs.p2!.notes).toBe('Mention X');
  });

  it('keeps notes sorted and skips blank ones', () => {
    let { ledger: l } = addStudent(emptyLedger(), 'Ada', '', 's1');
    l = addNote(l, 's1', { date: '2026-10-10', tag: 'class', course: '', text: 'second' }, 'n2');
    l = addNote(l, 's1', { date: '2026-09-01', tag: 'office-hours', course: 'CS 1', text: ' first ' }, 'n1');
    l = addNote(l, 's1', { date: '2026-09-05', tag: 'class', course: '', text: '   ' });
    l = addNote(l, 's1', { date: '2026-09-01', tag: 'class', course: '', text: 'same day' }, 'n3');
    expect(l.students[0]!.notes.map((n) => n.text)).toEqual(['first', 'same day', 'second']);
    l = deleteNote(l, 's1', 'n1');
    expect(l.students[0]!.notes.map((n) => n.id)).toEqual(['n3', 'n2']);
    l = updateStudent(l, 's1', { name: 'Ada L.' });
    expect(l.students[0]!.name).toBe('Ada L.');
  });

  it('deletes a student with every request and attachment key', async () => {
    let l = addPacket(emptyLedger(), await packet(), TODAY).ledger;
    l = addStudent(l, 'Bob', 'bob@x.y', 'b').ledger;
    const sid = l.requests[0]!.studentId;
    const { ledger, attachmentKeys } = deleteStudent(l, sid);
    expect(ledger.students.map((s) => s.id)).toEqual(['b']);
    expect(ledger.requests).toEqual([]);
    expect(attachmentKeys).toEqual(['req1/a1', 'req1/a2']);
    expect(deleteRequest(l, 'req1').requests).toEqual([]);
  });
});

describe('courses', () => {
  it('merges roster and request courses, oldest first, without duplicates', async () => {
    let l = addPacket(emptyLedger(), await packet(), TODAY).ledger;
    const sid = l.requests[0]!.studentId;
    l = updateStudent(l, sid, { courses: [{ code: 'cs 143', title: '', term: 'fall 2025', grade: '', role: '' }, { code: 'CS 142', title: '', term: 'Spring 2025', grade: '', role: '' }, { code: '', title: 'Seminar', term: 'someday', grade: '', role: '' }] });
    expect(coursesFor(l, sid).map((c) => c.code || c.title)).toEqual(['Seminar', 'CS 142', 'cs 143']);
    expect(coursesFor(l, 'nobody')).toEqual([]);
  });
});

describe('deadlines', () => {
  it('orders open letters by urgency and closed ones last', async () => {
    let l = addPacket(emptyLedger(), await packet({ programs: [prog('late', '2026-10-20'), prog('soon', '2026-10-29'), prog('later', '2026-12-01'), prog('done', '2026-11-01'), prog('no', '2026-11-20')] }), TODAY).ledger;
    l = setStatus(l, 'req1', 'done', 'submitted', TODAY);
    l = setStatus(l, 'req1', 'no', 'declined', TODAY);
    const rows = deadlines(l, TODAY);
    expect(rows.map((r) => [r.program.id, r.urgency, r.daysLeft])).toEqual([
      ['late', 'overdue', -2],
      ['soon', 'due-soon', 7],
      ['later', 'upcoming', 40],
      ['no', 'closed', 29],
      ['done', 'closed', 10],
    ]);
    expect(stats(l, TODAY)).toEqual({ open: 3, dueSoon: 1, overdue: 1, submitted: 1, newRequests: 1, students: 1 });
  });

  it('treats a program without a state as new', async () => {
    const l = addPacket(emptyLedger(), await packet(), TODAY).ledger;
    const r = { ...l.requests[0]!, programs: {} };
    expect(deadlines({ ...l, requests: [r] }, TODAY)[0]!.state.status).toBe('new');
  });

  it('exports CSV with quoting and defused formulas', async () => {
    let l = addPacket(emptyLedger(), await packet({ programs: [{ ...prog('p1', '2026-10-20', '=HYPERLINK("x")'), kind: 'PhD, CS' }] }), TODAY).ledger;
    l = setStatus(l, 'req1', 'p1', 'submitted', '2026-10-19');
    const csv = deadlinesCsv(l, TODAY);
    const [head, row] = csv.trim().split('\n');
    expect(head).toBe('student,email,program,kind,deadline,days_left,status,submitted_on,method,url');
    expect(row).toBe(`Ada Lovelace,ada@test.edu,"'=HYPERLINK(""x"")","PhD, CS",2026-10-20,-2,Submitted,2026-10-19,email,`);
  });
});

describe('quick capture', () => {
  it('splits name and text, with an optional tag', () => {
    expect(parseQuickNote('Ada Lovelace: great question on hashing')).toEqual({ who: 'Ada Lovelace', text: 'great question on hashing', tag: null });
    expect(parseQuickNote('ada@test.edu - fixed the build #oh')).toEqual({ who: 'ada@test.edu', text: 'fixed the build', tag: 'office-hours' });
    expect(parseQuickNote('Mary-Jane: led the demo #project')).toEqual({ who: 'Mary-Jane', text: 'led the demo', tag: 'project' });
    expect(parseQuickNote('#TA Bob: ran section')).toEqual({ who: '#TA Bob', text: 'ran section', tag: null });
    expect(parseQuickNote('Bob: #research')).toBeNull();
    expect(parseQuickNote('no separator here')).toBeNull();
  });

  it('matches a student by email, full name or a unique first name', () => {
    let l = addStudent(emptyLedger(), 'Ada Lovelace', 'ada@test.edu', 'a').ledger;
    l = addStudent(l, 'Ada Byron', 'byron@test.edu', 'b').ledger;
    l = addStudent(l, 'Grace Hopper', 'grace@test.edu', 'g').ledger;
    expect(matchStudent(l, 'ADA@test.edu')?.id).toBe('a');
    expect(matchStudent(l, 'ada byron')?.id).toBe('b');
    expect(matchStudent(l, 'grace')?.id).toBe('g');
    expect(matchStudent(l, 'hopper')?.id).toBe('g');
    expect(matchStudent(l, 'ada')).toBeNull();
    expect(matchStudent(l, ' ')).toBeNull();
  });
});

describe('parseLedger', () => {
  it('accepts its own output and rejects junk', async () => {
    const l = addPacket(emptyLedger(), await packet(), TODAY).ledger;
    const noCourses = JSON.parse(JSON.stringify(l));
    delete noCourses.students[0].courses;
    expect(parseLedger(JSON.stringify(noCourses))!.students[0]!.courses).toEqual([]);
    expect(parseLedger(JSON.stringify(l))).toEqual(l);
    expect(parseLedger('nope')).toBeNull();
    expect(parseLedger('{"v":2}')).toBeNull();
    expect(parseLedger('{"v":1,"students":[{"id":1}],"requests":[]}')).toBeNull();
    expect(parseLedger('{"v":1,"students":[],"requests":[{"studentId":"x"}]}')).toBeNull();
  });
});
