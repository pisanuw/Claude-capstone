import { describe, expect, it } from 'vitest';
import { packBytes } from '../src/core/codec';
import { checkRequest, earliestDeadline, hasErrors, isPacket, MAX_FILE_BYTES, openPacket, packetFileName, sealPacket } from '../src/core/request';
import { generateKeyPair, seal } from '../src/core/seal';
import { packet, policy, TODAY } from './fixtures';

const fields = (issues: { field: string }[]) => issues.map((i) => i.field);

describe('checkRequest', () => {
  it('accepts a complete request', async () => {
    expect(checkRequest(policy(), await packet(), TODAY)).toEqual([]);
  });

  it('lists every missing piece as an error', async () => {
    const p = await packet({
      student: { name: '', email: 'x', studentId: '', pronouns: '', howKnown: '' },
      programs: [{ id: 'p1', name: '', kind: '', url: '', deadline: '12/1', method: '', tailoring: '' }],
      courses: [{ code: '', title: '', term: '', grade: '', role: '' }],
      answers: [''],
      attachments: [],
    });
    const issues = checkRequest(policy(), { ...p, release: { ...p.release, consent: false, scope: [], signature: 'x' } }, TODAY);
    expect(hasErrors(issues)).toBe(true);
    expect(fields(issues)).toEqual(['name', 'email', 'howKnown', 'program-0-name', 'program-0-deadline', 'program-0-method', 'course-0-code', 'course-0-term', 'doc-cv', 'doc-statement', 'answer-0', 'release', 'release', 'signature']);
  });

  it('needs programs and courses, and caps the program count', async () => {
    expect(fields(checkRequest(policy(), await packet({ programs: [], courses: [] }), TODAY))).toEqual(expect.arrayContaining(['programs', 'courses']));
    const many = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: '', url: '', deadline: '2026-12-01', method: 'email', tailoring: '' }));
    const issues = checkRequest(policy({ maxPrograms: 2 }), await packet({ programs: many }), TODAY);
    expect(issues.find((i) => i.field === 'programs')?.message).toMatch(/at most 2 programs.*listed 3/);
  });

  it('warns about short notice and blocks past deadlines', async () => {
    const mk = (deadline: string) => packet({ programs: [{ id: 'p1', name: 'Alpha', kind: '', url: '', deadline, method: 'email', tailoring: '' }] });
    const soon = checkRequest(policy(), await mk('2026-10-25'), TODAY);
    expect(soon).toEqual([{ level: 'warn', field: 'program-0-deadline', message: expect.stringMatching(/in 3 days; I ask for 21 days/) }]);
    expect(checkRequest(policy(), await mk(TODAY), TODAY)[0]!.message).toMatch(/is today/);
    expect(checkRequest(policy(), await mk('2026-10-23'), TODAY)[0]!.message).toMatch(/in 1 day;/);
    expect(checkRequest(policy(), await mk('2026-10-21'), TODAY)[0]).toMatchObject({ level: 'error', message: expect.stringMatching(/already passed/) });
  });

  it('warns when the grade rule is not met, ignoring pass/fail', async () => {
    const pol = policy({ minGrade: 'A-', minCourses: 2 });
    const p = await packet({ courses: [{ code: 'CS 1', title: '', term: 'Fall 2025', grade: 'A', role: '' }, { code: 'CS 2', title: '', term: 'Wi 2026', grade: 'CR', role: '' }] });
    const issues = checkRequest(pol, p, TODAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'warn', field: 'courses', message: expect.stringMatching(/at least 2 courses at A- or better.*you list 1/) });
    expect(checkRequest(policy({ minGrade: 'B', minCourses: 1 }), p, TODAY)).toEqual([]);
    expect(checkRequest(policy({ minGrade: 'A', minCourses: 1 }), await packet({ courses: [{ code: 'X', title: '', term: '2025', grade: 'B', role: '' }] }), TODAY)[0]!.message).toMatch(/1 course at A/);
  });

  it('limits attachment sizes', async () => {
    const p = await packet({
      attachments: [
        { id: 'a', kind: 'cv', name: 'huge.pdf', type: '', size: MAX_FILE_BYTES + 1 },
        { id: 'b', kind: 'statement', name: 's.pdf', type: '', size: MAX_FILE_BYTES },
        { id: 'c', kind: 'other', name: 'o.pdf', type: '', size: MAX_FILE_BYTES },
      ],
    });
    expect(fields(checkRequest(policy(), p, TODAY))).toEqual(['doc-cv', 'docs']);
  });

  it('ignores blank and optional policy questions', async () => {
    expect(checkRequest(policy({ questions: ['  ', 'Anything else? (Optional) '] }), await packet({ answers: [] }), TODAY)).toEqual([]);
  });

  it('finds the earliest valid deadline', () => {
    expect(earliestDeadline({ programs: [{ deadline: '2026-12-01' }, { deadline: 'x' }, { deadline: '2026-11-15' }] as never })).toBe('2026-11-15');
    expect(earliestDeadline({ programs: [] })).toBeNull();
  });
});

describe('packets', () => {
  it('seal and open, rejecting non-requests', async () => {
    const k = await generateKeyPair();
    const p = await packet();
    expect(await openPacket(k.privateKey, await sealPacket(k.publicKey, p))).toEqual(p);
    await expect(openPacket(k.privateKey, await seal(k.publicKey, packBytes({ hello: 1 })))).rejects.toThrow(/not a letter request/);
    expect(isPacket(null)).toBe(false);
    expect(isPacket({ ...p, programs: [{ id: 1 }] })).toBe(false);
  });

  it('name the download after the student', async () => {
    expect(packetFileName(await packet())).toBe('letter-request-ada-lovelace-2026-10-22.ledger');
    expect(packetFileName(await packet({ student: { name: 'Zoë  Ng-Li!', email: '', studentId: '', pronouns: '', howKnown: '' } }))).toBe('letter-request-zoe-ng-li-2026-10-22.ledger');
    expect(packetFileName(await packet({ student: { name: '李', email: '', studentId: '', pronouns: '', howKnown: '' } }))).toBe('letter-request-student-2026-10-22.ledger');
  });
});
