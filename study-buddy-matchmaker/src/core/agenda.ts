// Turns a study group into a shared agenda and into one private card per
// member. Cards follow the privacy rule: a student sees their own levels and
// gaps, who they are meeting and which topics each person leads, never a
// groupmate's scores or gaps.

import { level, type Level, type Profile, type Thresholds } from './gradebook';
import type { Group } from './match';
import { resourcesFor, type CustomResource, type Resource } from './resources';

export interface Session {
  topic: string;
  leader: number;
  learners: number[];
  /** Sum of the leader's mastery minus each learner's. */
  gain: number;
  resources: Resource[];
}

export interface Agenda {
  sessions: Session[];
  /** Topics nobody in the group is strong in but somebody has a gap: take these to office hours. */
  officeHours: { topic: string; resources: Resource[] }[];
}

export function agendaFor(ps: Profile[], g: Group, topics: string[], th: Thresholds, custom: CustomResource[] = [], maxSessions = 4): Agenda {
  const sessions: Session[] = [];
  for (const t of topics) {
    let leader = -1;
    let best = -1;
    for (const m of g.members) {
      const v = (ps[m] as Profile).mastery.get(t);
      if (typeof v === 'number' && v >= th.strong && v > best) {
        best = v;
        leader = m;
      }
    }
    if (leader < 0) continue;
    const learners = g.members.filter((m) => {
      const v = (ps[m] as Profile).mastery.get(t);
      return m !== leader && typeof v === 'number' && v < th.strong;
    });
    if (!learners.length) continue;
    const gain = learners.reduce((s, m) => s + best - ((ps[m] as Profile).mastery.get(t) as number), 0);
    sessions.push({ topic: t, leader, learners, gain, resources: resourcesFor(t, custom) });
  }
  sessions.sort((a, b) => b.gain - a.gain || a.topic.localeCompare(b.topic));
  // Alternate leaders where possible so no one only teaches or only learns.
  const picked: Session[] = [];
  const rest = [...sessions];
  while (picked.length < maxSessions && rest.length) {
    const last = picked[picked.length - 1]?.leader;
    const k = rest.findIndex((s) => s.leader !== last);
    picked.push(rest.splice(k < 0 ? 0 : k, 1)[0] as Session);
  }
  const officeHours = g.sharedGaps.map((topic) => ({ topic, resources: resourcesFor(topic, custom) }));
  return { sessions: picked, officeHours };
}

export interface Card {
  student: number;
  groupmates: number[];
  /** The student's own level per topic. */
  levels: { topic: string; level: Level }[];
  leads: { topic: string; with: number[] }[];
  learns: { topic: string; from: number }[];
  /** Own gaps no session in the group covers. */
  ownGaps: { topic: string; resources: Resource[] }[];
}

export function cardsFor(ps: Profile[], g: Group, agenda: Agenda, topics: string[], th: Thresholds, custom: CustomResource[] = []): Card[] {
  return g.members.map((m) => {
    const levels = topics.map((t) => ({ topic: t, level: level((ps[m] as Profile).mastery.get(t), th) }));
    const leads = agenda.sessions.filter((s) => s.leader === m).map((s) => ({ topic: s.topic, with: s.learners }));
    const learns = agenda.sessions.filter((s) => s.learners.includes(m)).map((s) => ({ topic: s.topic, from: s.leader }));
    const covered = new Set(learns.map((l) => l.topic));
    const ownGaps = levels
      .filter((l) => (l.level === 'gap' || l.level === 'shaky') && !covered.has(l.topic))
      .map((l) => ({ topic: l.topic, resources: resourcesFor(l.topic, custom) }));
    return { student: m, groupmates: g.members.filter((x) => x !== m), levels, leads, learns, ownGaps };
  });
}
