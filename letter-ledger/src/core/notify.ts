/**
 * Status updates to students, written as ready-to-send emails (a mailto link
 * or text to paste) rather than sent by a mail service, so no student address
 * leaves the professor's browser until they press send themselves.
 */

import { prettyDay } from './dates';
import type { LedgerRequest, Policy, ProgramStatus } from './types';

const LINES: Record<ProgramStatus, (program: string, extra: string) => string> = {
  new: (p) => `${p}: received; I have not decided yet.`,
  accepted: (p) => `${p}: yes, I will write this letter.`,
  declined: (p) => `${p}: I am not able to write this one.`,
  drafting: (p) => `${p}: I am writing the letter now.`,
  submitted: (p, extra) => `${p}: submitted${extra}.`,
};

export interface Email {
  to: string;
  subject: string;
  body: string;
}

export function statusEmail(policy: Pick<Policy, 'professor'>, r: LedgerRequest): Email {
  const first = r.packet.student.name.trim().split(/\s+/)[0] || 'there';
  const lines = r.packet.programs.map((p) => {
    const st = r.programs[p.id];
    const status = st?.status ?? 'new';
    const extra = status === 'submitted' && st?.submittedOn ? ` on ${prettyDay(st.submittedOn)}` : '';
    const changed = st && st.status !== 'new' && st.notifiedStatus !== st.status ? ' (update)' : '';
    return `- ${LINES[status](`${p.name} (due ${prettyDay(p.deadline)})`, extra)}${changed}`;
  });
  const anyDeclined = r.packet.programs.some((p) => r.programs[p.id]?.status === 'declined');
  const allDone = r.packet.programs.every((p) => ['submitted', 'declined'].includes(r.programs[p.id]?.status ?? 'new'));
  const body = [
    `Hi ${first},`,
    '',
    'Here is where your recommendation letters stand:',
    '',
    ...lines,
    '',
    anyDeclined ? 'For any I cannot write, please ask another recommender soon so your deadline is not at risk.' : '',
    allDone ? 'That is everything on your list. Good luck with your applications, and let me know how they turn out.' : 'Please tell me right away if a deadline or submission link changes.',
    '',
    policy.professor.trim() || '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
    .trim();
  return { to: r.packet.student.email, subject: 'Your recommendation letter requests: status update', body };
}

export function mailto(e: Email): string {
  return `mailto:${encodeURIComponent(e.to)}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
}
