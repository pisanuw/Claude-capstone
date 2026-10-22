/**
 * The fact outline: everything the professor and the student recorded,
 * assembled into a Markdown outline for one or more programs. It drafts no
 * prose and adds nothing that is not in the ledger; grades appear only when
 * the student's release covers them. One letter is reused across programs by
 * keeping paragraphs 1-3 and 5 shared and tailoring paragraph 4 per program.
 */

import { prettyDay, termKey } from './dates';
import { coursesFor, student } from './ledger';
import type { Ledger, Note, NoteTag, Program } from './types';
import { DOC_LABELS, SCOPE_LABELS, STATUS_LABELS, TAG_LABELS } from './types';

export interface OutlineOptions {
  /** Program ids to include; empty or omitted means every program in the request. */
  programIds?: string[];
  /** Problems from releaseProblems(), listed at the top when present. */
  releaseProblems?: string[];
  today: string;
}

const TAG_ORDER: NoteTag[] = ['class', 'project', 'office-hours', 'research', 'ta', 'other'];
const ACADEMIC: NoteTag[] = ['class', 'project'];
const BEYOND: NoteTag[] = ['office-hours', 'research', 'ta', 'other'];

/** Markdown inline text: keeps user text from turning into headings, lists or links. */
export function md(s: string): string {
  return s
    .replace(/\r?\n+/g, ' ')
    .replace(/([\\`*_[\]<>#|])/g, '\\$1')
    .trim();
}

function quoteNote(n: Note): string {
  return `${prettyDay(n.date)}${n.course ? `, ${md(n.course)}` : ''}: ${md(n.text)}`;
}

function programHeading(p: Program): string {
  return `${md(p.name)}${p.kind.trim() ? ` (${md(p.kind)})` : ''}`;
}

export function factOutline(l: Ledger, requestId: string, opts: OutlineOptions): string {
  const r = l.requests.find((x) => x.packet.id === requestId);
  if (!r) return '';
  const pk = r.packet;
  const s = student(l, r.studentId);
  const notes = s?.notes ?? [];
  const name = s?.name || pk.student.name;
  const first = name.trim().split(/\s+/)[0] ?? name;
  const grades = pk.release.scope.includes('grades');
  const programs = pk.programs.filter((p) => !opts.programIds?.length || opts.programIds.includes(p.id));
  const courses = coursesFor(l, r.studentId);
  const out: string[] = [];
  const gaps: string[] = [];

  out.push(`# Letter outline: ${md(name)}`, '');
  out.push(`Prepared ${prettyDay(opts.today)} from your notes and ${md(first)}'s request of ${prettyDay(pk.createdAt.slice(0, 10))}. Facts only: every line below was recorded by you or the student.`, '');

  out.push('## Release', '');
  if (opts.releaseProblems?.length) {
    out.push('> **Check the release before writing:**');
    for (const p of opts.releaseProblems) out.push(`> - ${md(p)}`);
    out.push('');
  }
  out.push(`- Signed by ${md(pk.release.signature)} on ${prettyDay(pk.release.signedAt.slice(0, 10))}.`);
  out.push(`- The letter may discuss: ${pk.release.scope.map((x) => SCOPE_LABELS[x]).join('; ') || 'nothing'}.`);
  out.push(`- Right to read the letter: ${pk.release.waive ? 'waived' : 'not waived (the student may read it)'}.`);
  if (!grades) out.push('- **Do not cite grades or rank:** the release does not cover them.');
  out.push('');

  out.push('## How you know them', '');
  if (pk.student.howKnown.trim()) out.push(`- In ${md(first)}'s words: ${md(pk.student.howKnown)}`);
  for (const c of courses) {
    const bits = [c.code && md(c.code), c.title && md(c.title)].filter(Boolean).join(' ');
    const role = c.role.trim() && c.role.trim().toLowerCase() !== 'student' ? `, as ${md(c.role)}` : '';
    out.push(`- ${bits}, ${md(c.term)}${role}${grades && c.grade.trim() ? `, grade ${md(c.grade)}` : ''}`);
  }
  const keys = courses.map((c) => termKey(c.term)).filter((k): k is number => k !== null);
  if (keys.length) {
    const firstTerm = courses.find((c) => termKey(c.term) === Math.min(...keys))!.term;
    const terms = new Set(keys).size;
    out.push(`- Known since ${md(firstTerm)} (${terms} term${terms === 1 ? '' : 's'} with you).`);
  }
  out.push('');

  out.push('## What you observed', '');
  if (!notes.length) {
    out.push('> You have no notes on this student. Add what you remember (office hours, questions, projects) before writing, or ask them for specifics.');
    gaps.push('No observations of your own yet: the letter will lean on what the student told you.');
  }
  for (const tag of TAG_ORDER) {
    const group = notes.filter((n) => n.tag === tag);
    if (!group.length) continue;
    out.push(`### ${TAG_LABELS[tag]}`, '');
    for (const n of group) out.push(`- ${quoteNote(n)}`);
    out.push('');
  }

  out.push('## What the student asks you to highlight', '');
  if (pk.highlights.trim()) out.push(`- ${md(pk.highlights)}`);
  pk.questions.forEach((q, i) => {
    const a = pk.answers[i]?.trim();
    if (q.trim() && a) out.push(`- **${md(q)}** ${md(a)}`);
  });
  if (!pk.highlights.trim() && !pk.answers.some((a) => a.trim())) out.push('- (nothing given)');
  if (pk.attachments.length) out.push(`- Attached: ${pk.attachments.map((a) => `${DOC_LABELS[a.kind]} (${md(a.name)})`).join('; ')}.`);
  out.push('');

  out.push('## Programs', '');
  for (const p of programs) {
    const st = r.programs[p.id];
    out.push(`### ${programHeading(p)}`, '');
    out.push(`- Due ${prettyDay(p.deadline)}; submit via ${md(p.method) || '(not given)'}${p.url.trim() ? `; ${md(p.url)}` : ''}.`);
    out.push(`- Status: ${STATUS_LABELS[st?.status ?? 'new']}.`);
    if (p.tailoring.trim()) out.push(`- Student says: ${md(p.tailoring)}`);
    if (st?.notes.trim()) out.push(`- Your notes: ${md(st.notes)}`);
    if (!p.tailoring.trim() && !st?.notes.trim()) gaps.push(`Nothing yet on why ${md(first)} fits ${md(p.name)}.`);
    out.push('');
  }

  const academic = notes.filter((n) => ACADEMIC.includes(n.tag)).slice(-3);
  const beyond = notes.filter((n) => BEYOND.includes(n.tag)).slice(-3);
  const courseList = courses.map((c) => [c.code, c.title].filter(Boolean).join(' ')).filter(Boolean);
  out.push('## Suggested structure', '');
  if (programs.length > 1) out.push(`One letter for ${programs.length} programs: keep paragraphs 1-3 and 5 the same and rewrite paragraph 4 for each program.`, '');
  out.push(`1. **Opening.** Who you are, which program${programs.length === 1 ? '' : 's'} this supports, and how long and in what role you have known ${md(first)}${courseList.length ? ` (${courseList.map(md).join(', ')})` : ''}.`);
  out.push(`2. **Academic evidence.** ${grades ? 'Grades and where they place the student; ' : ''}specific work you saw.`);
  for (const n of academic) out.push(`   - ${quoteNote(n)}`);
  if (!academic.length) {
    out.push('   - (no class or project notes; add one concrete example)');
    gaps.push('No class or project example for paragraph 2.');
  }
  out.push('3. **Beyond the coursework.** Initiative, curiosity, how they work with others.');
  for (const n of beyond) out.push(`   - ${quoteNote(n)}`);
  if (!beyond.length) out.push('   - (no office-hours, research or TA notes)');
  out.push('4. **Fit for the program.**');
  for (const p of programs) out.push(`   - ${programHeading(p)}: ${p.tailoring.trim() ? md(p.tailoring) : '(add why they fit)'}${r.programs[p.id]?.notes.trim() ? `; ${md(r.programs[p.id]!.notes)}` : ''}`);
  out.push(`5. **Closing.** Your overall recommendation and a comparison you can stand behind (for example, top 5% of the students you have taught), and how to reach you.`);
  gaps.push('Decide on the comparison for paragraph 5 (rank or percentile you can defend).');
  out.push('');

  out.push('## Before you write', '');
  for (const g of gaps) out.push(`- [ ] ${g}`);
  out.push('');
  return out.join('\n');
}
