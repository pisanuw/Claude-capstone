// Instructor and student exports: a pairings CSV, a Markdown handout with
// every group's agenda, and one Markdown card per student.

import type { Agenda, Card } from './agenda';
import { toCsv } from './csv';
import type { Level, Profile } from './gradebook';
import type { Group } from './match';

const LEVEL_TEXT: Record<Level, string> = { strong: 'strong', shaky: 'getting there', gap: 'needs work', none: 'no data' };

const nameOf = (ps: Profile[], i: number) => (ps[i] as Profile).student.name;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function pairingsCsv(ps: Profile[], groups: Group[], agendas: Agenda[]): string {
  const rows: (string | number)[][] = [['group', 'student id', 'name', 'groupmates', 'leads', 'learns', 'group score']];
  groups.forEach((g, k) => {
    const a = agendas[k] as Agenda;
    for (const m of g.members) {
      rows.push([
        k + 1,
        (ps[m] as Profile).student.id,
        nameOf(ps, m),
        g.members.filter((x) => x !== m).map((x) => nameOf(ps, x)).join('; '),
        a.sessions.filter((s) => s.leader === m).map((s) => s.topic).join('; '),
        a.sessions.filter((s) => s.learners.includes(m)).map((s) => s.topic).join('; '),
        g.score.toFixed(2),
      ]);
    }
  });
  return toCsv(rows);
}

export function groupsMarkdown(ps: Profile[], groups: Group[], agendas: Agenda[]): string {
  const out = ['# Study groups', ''];
  groups.forEach((g, k) => {
    const a = agendas[k] as Agenda;
    out.push(`## Group ${k + 1}: ${list(g.members.map((m) => nameOf(ps, m)))}`, '');
    if (!a.sessions.length) out.push('No topic where one member can help another; consider regrouping by hand.', '');
    a.sessions.forEach((s, i) => {
      out.push(`${i + 1}. **${s.topic}**: ${nameOf(ps, s.leader)} leads, with ${list(s.learners.map((m) => nameOf(ps, m)))}.`);
      for (const r of s.resources) out.push(`   - [${r.title}](${r.url})`);
    });
    if (a.sessions.length) out.push('');
    if (a.officeHours.length) out.push(`Bring to office hours: ${list(a.officeHours.map((o) => o.topic))}.`, '');
  });
  return out.join('\n');
}

export function cardMarkdown(ps: Profile[], c: Card, groupNo: number): string {
  const me = (ps[c.student] as Profile).student;
  const out = [`# ${me.name}: study group ${groupNo}`, '', `You are meeting ${list(c.groupmates.map((m) => nameOf(ps, m)))}.`, ''];
  if (c.leads.length) {
    out.push('**You lead:**', '');
    for (const l of c.leads) out.push(`- ${l.topic}, with ${list(l.with.map((m) => nameOf(ps, m)))}`);
    out.push('');
  }
  if (c.learns.length) {
    out.push('**You get help with:**', '');
    for (const l of c.learns) out.push(`- ${l.topic}, led by ${nameOf(ps, l.from)}`);
    out.push('');
  }
  out.push('**Where you stand** (only you see this):', '');
  for (const l of c.levels) out.push(`- ${l.topic}: ${LEVEL_TEXT[l.level]}`);
  out.push('');
  if (c.ownGaps.length) {
    out.push('**Also worth your time on your own:**', '');
    for (const g of c.ownGaps) {
      out.push(`- ${g.topic}${g.resources.length ? ': ' + g.resources.map((r) => `[${r.title}](${r.url})`).join(', ') : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}

export { LEVEL_TEXT };
