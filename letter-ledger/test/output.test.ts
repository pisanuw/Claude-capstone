import { describe, expect, it } from 'vitest';
import { buildIcs, fold, icsText } from '../src/core/ics';
import { addNote, addPacket, deadlines, emptyLedger, markNotified, setProgramNotes, setStatus, updateStudent } from '../src/core/ledger';
import { mailto, statusEmail } from '../src/core/notify';
import { factOutline, md } from '../src/core/outline';
import { buildRelease } from '../src/core/release';
import type { Program } from '../src/core/types';
import { packet, policy, TODAY } from './fixtures';

const prog = (id: string, deadline: string, over: Partial<Program> = {}): Program => ({ id, name: `Program ${id}`, kind: '', url: '', deadline, method: 'email', tailoring: '', ...over });

describe('ics', () => {
  it('escapes and folds per RFC 5545', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = `SUMMARY:${'é'.repeat(60)}`;
    const folded = fold(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    expect(fold('short')).toBe('short');
  });

  it('writes one event per open letter with alarms', async () => {
    let l = addPacket(emptyLedger(), await packet({ programs: [prog('p1', '2026-11-30', { url: 'https://x.example/a', kind: 'PhD' }), prog('p2', '2026-11-01')] }), TODAY).ledger;
    l = setStatus(l, 'req1', 'p2', 'submitted', TODAY);
    const ics = buildIcs(deadlines(l, TODAY), new Date('2026-10-22T10:11:12.345Z'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:req1-p1@letter-ledger');
    expect(ics).toContain('DTSTAMP:20261022T101112Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201');
    expect(ics).toContain('SUMMARY:Letter due: Ada Lovelace\\, Program p1');
    expect(ics).toContain('URL:https://x.example/a');
    expect(ics).toContain('TRIGGER:-P6DT15H');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(buildIcs([], new Date(0), [])).not.toContain('VEVENT');
  });
});

describe('status emails', () => {
  it('summarises each program and flags updates', async () => {
    let l = addPacket(emptyLedger(), await packet({ programs: [prog('p1', '2026-11-30'), prog('p2', '2026-12-01'), prog('p3', '2026-12-02')] }), TODAY).ledger;
    l = setStatus(l, 'req1', 'p1', 'submitted', '2026-11-20');
    l = setStatus(l, 'req1', 'p2', 'declined', TODAY);
    const e = statusEmail(policy(), l.requests[0]!);
    expect(e.to).toBe('ada@test.edu');
    expect(e.body).toMatch(/^Hi Ada,/);
    expect(e.body).toContain('- Program p1 (due Nov 30, 2026): submitted on Nov 20, 2026. (update)');
    expect(e.body).toContain('- Program p2 (due Dec 1, 2026): I am not able to write this one. (update)');
    expect(e.body).toContain('- Program p3 (due Dec 2, 2026): received; I have not decided yet.');
    expect(e.body).toContain('ask another recommender');
    expect(e.body).toContain('tell me right away');
    expect(e.body.endsWith('Prof. Test')).toBe(true);
    expect(e.body).not.toMatch(/\n\n\n/);
    const m = mailto(e);
    expect(m.startsWith('mailto:ada%40test.edu?subject=Your%20recommendation')).toBe(true);
    expect(decodeURIComponent(m.split('&body=')[1]!)).toBe(e.body);
  });

  it('closes out when everything is done', async () => {
    let l = addPacket(emptyLedger(), await packet(), TODAY).ledger;
    l = setStatus(l, 'req1', 'p1', 'submitted', TODAY);
    l = markNotified(l, 'req1');
    const r = { ...l.requests[0]!, packet: { ...l.requests[0]!.packet, student: { ...l.requests[0]!.packet.student, name: ' ' } } };
    const e = statusEmail({ professor: '' }, r);
    expect(e.body).toMatch(/^Hi there,/);
    expect(e.body).toContain('That is everything on your list');
    expect(e.body).not.toContain('(update)');
    const noState = { ...r, programs: {} };
    expect(statusEmail({ professor: '' }, noState).body).toContain('received; I have not decided yet.');
  });
});

describe('fact outline', () => {
  it('assembles facts, notes and per-program tailoring', async () => {
    const p = await packet({ programs: [prog('p1', '2026-12-01', { name: 'Alpha PhD', kind: 'PhD', tailoring: 'Systems lab.', url: 'https://a.example' }), prog('p2', '2026-12-15', { name: 'Beta MS' })] });
    let l = addPacket(emptyLedger(), p, TODAY).ledger;
    const sid = l.requests[0]!.studentId;
    l = updateStudent(l, sid, { courses: [{ code: 'CS 142', title: 'Intro', term: 'Spring 2025', grade: 'A-', role: 'TA' }] });
    l = addNote(l, sid, { date: '2026-09-30', tag: 'office-hours', course: 'CS 143', text: 'Great *question* on hashing' }, 'n1');
    l = addNote(l, sid, { date: '2026-10-05', tag: 'project', course: '', text: 'Best project' }, 'n2');
    l = setProgramNotes(l, 'req1', 'p2', 'Their thesis track fits.');
    const out = factOutline(l, 'req1', { today: TODAY, releaseProblems: ['Something off'] });
    expect(out).toContain('# Letter outline: Ada Lovelace');
    expect(out).toContain('> - Something off');
    expect(out).toContain('- CS 142 Intro, Spring 2025, as TA, grade A-');
    expect(out).toContain('- CS 143 Data Structures, Fall 2025, grade A');
    expect(out).toContain('- Known since Spring 2025 (2 terms with you).');
    expect(out).toContain('### Office hours\n\n- Sep 30, 2026, CS 143: Great \\*question\\* on hashing');
    expect(out).toContain('### Alpha PhD (PhD)');
    expect(out).toContain('- Student says: Systems lab.');
    expect(out).toContain('- Your notes: Their thesis track fits.');
    expect(out).toContain('One letter for 2 programs');
    expect(out).toContain('   - Oct 5, 2026: Best project');
    expect(out).toContain('   - Beta MS: (add why they fit); Their thesis track fits.');
    expect(out).toContain('**What do you most want the letter to say');
    expect(out).toContain('Attached: CV or resume (cv.pdf)');
    expect(out).not.toContain('Do not cite grades');
    expect(out).not.toContain('No observations');
  });

  it('withholds grades without a release and lists the gaps', async () => {
    const pol = policy();
    const base = await packet();
    const release = await buildRelease(pol, { student: 'Ada Lovelace', programs: base.programs, scope: ['conduct'], waive: false, date: TODAY }, 'Ada Lovelace', true, TODAY);
    const p = { ...base, release, highlights: '', answers: [''], attachments: [], programs: [{ ...base.programs[0]!, tailoring: '' }], courses: [{ code: 'CS 1', title: '', term: 'whenever', grade: 'A', role: 'student' }] };
    const l = addPacket(emptyLedger(), p, TODAY).ledger;
    const out = factOutline(l, 'req1', { today: TODAY, programIds: ['p1'] });
    expect(out).toContain('**Do not cite grades or rank:**');
    expect(out).toContain('not waived');
    expect(out).toContain('- CS 1, whenever\n');
    expect(out).not.toContain('Known since');
    expect(out).toContain('- (nothing given)');
    expect(out).toContain('You have no notes on this student');
    expect(out).toContain('- [ ] No observations of your own yet');
    expect(out).toContain('- [ ] No class or project example');
    expect(out).toContain('- [ ] Nothing yet on why Ada fits Alpha University PhD.');
    expect(out).toContain('(no office-hours, research or TA notes)');
    expect(out).toContain('Status: New.');
    expect(factOutline(l, 'missing', { today: TODAY })).toBe('');
  });

  it('escapes markdown in user text', () => {
    expect(md('# heading\n- [link](x) `code` <b>')).toBe('\\# heading - \\[link\\](x) \\`code\\` \\<b\\>');
  });
});
