import { defaultPolicy } from '../src/core/policy';
import { buildRelease } from '../src/core/release';
import type { Policy, RequestPacket } from '../src/core/types';

export const TODAY = '2026-10-22';

export function policy(over: Partial<Policy> = {}): Policy {
  return { ...defaultPolicy('PUBKEY'), professor: 'Prof. Test', institution: 'Test U', email: 'prof@test.edu', ...over };
}

export async function packet(over: Partial<RequestPacket> = {}, pol: Policy = policy()): Promise<RequestPacket> {
  const programs = over.programs ?? [{ id: 'p1', name: 'Alpha University PhD', kind: 'PhD', url: 'https://alpha.example/apply', deadline: '2026-12-01', method: 'Portal email', tailoring: 'Systems lab.' }];
  const name = over.student?.name ?? 'Ada Lovelace';
  const release = over.release ?? (await buildRelease(pol, { student: name, programs, scope: ['grades', 'performance'], waive: true, date: TODAY }, name, true, `${TODAY}T12:00:00.000Z`));
  return {
    v: 1,
    id: 'req1',
    createdAt: `${TODAY}T12:00:00.000Z`,
    student: { name, email: 'ada@test.edu', studentId: '', pronouns: '', howKnown: 'CS 143 with you.' },
    courses: [{ code: 'CS 143', title: 'Data Structures', term: 'Fall 2025', grade: 'A', role: 'student' }],
    highlights: 'Persistence.',
    answers: ['An example.'],
    attachments: [
      { id: 'a1', kind: 'cv', name: 'cv.pdf', type: 'application/pdf', size: 1000 },
      { id: 'a2', kind: 'statement', name: 'sop.pdf', type: 'application/pdf', size: 2000 },
    ],
    questions: pol.questions,
    ...over,
    programs,
    release,
  };
}
