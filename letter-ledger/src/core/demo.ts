/**
 * A demo ledger for a made-up professor, dated relative to today so the
 * dashboard always has something overdue, due this week and later. Every
 * student, program and note is invented.
 */

import { addDays } from './dates';
import { toBase64, utf8 } from './codec';
import { addNote, addPacket, emptyLedger, setStatus, setProgramNotes, markNotified } from './ledger';
import { defaultPolicy } from './policy';
import { buildRelease } from './release';
import type { Attachment, CourseTaken, Ledger, NoteTag, Policy, Program, ProgramStatus, ReleaseScope, RequestPacket } from './types';

export function demoPolicy(publicKey: string): Policy {
  return {
    ...defaultPolicy(publicKey),
    professor: 'Prof. Jordan Rivera',
    title: 'Associate Teaching Professor, Computer Science',
    institution: 'Example State University',
    email: 'jrivera@example.edu',
    minGrade: 'B+',
    minCourses: 1,
    conditions: 'I write letters for students who took at least one course with me and earned a B+ or better, or who worked with me as a TA or researcher. Please ask at least three weeks before your first deadline, and send one request with every program on it.',
    questions: ['What do you most want the letter to say about you, and what example from my course shows it?', 'Is there anything in your record you would like me to explain (a low grade, a gap)? (optional)'],
  };
}

interface DemoStudent {
  name: string;
  email: string;
  pronouns: string;
  howKnown: string;
  courses: CourseTaken[];
  programs: [name: string, kind: string, dueIn: number, method: string, tailoring: string, status: ProgramStatus][];
  highlights: string;
  answers: string[];
  scope: ReleaseScope[];
  waive: boolean;
  docs: Attachment['kind'][];
  notes: [daysAgo: number, tag: NoteTag, course: string, text: string][];
  askedDaysAgo: number;
}

const C = (code: string, title: string, term: string, grade: string, role = 'student'): CourseTaken => ({ code, title, term, grade, role });

const STUDENTS: DemoStudent[] = [
  {
    name: 'Maya Okafor',
    email: 'maya.okafor@example.edu',
    pronouns: 'she/her',
    howKnown: 'I took CS 143 and CS 332 with you, then TA-ed CS 143 last spring. We met most weeks in office hours about the hashing assignment.',
    courses: [C('CS 143', 'Data Structures', 'Fall 2024', 'A'), C('CS 332', 'Operating Systems', 'Winter 2025', 'A-'), C('CS 143', 'Data Structures', 'Spring 2025', '', 'TA')],
    programs: [
      ['University of Somewhere, PhD in Computer Science', 'PhD', 5, 'Portal sends a link by email', 'Systems group; I want to work on storage for ML training.', 'drafting'],
      ['Northfield Institute of Technology, PhD CS', 'PhD', 19, 'Portal sends a link by email', 'Operating systems and file systems, Prof. Lee\'s lab.', 'accepted'],
      ['Lakeside University, MS CS (thesis)', 'MS', 33, 'Email letter to gradadmit@lakeside.example', 'Backup option with a thesis track in systems.', 'accepted'],
    ],
    highlights: 'Persistence on hard problems and that I explain things well to other students.',
    answers: ['That I can debug a hard problem without giving up: my lock-free queue in CS 332 took three rewrites before it passed the stress test.', ''],
    scope: ['grades', 'performance', 'conduct'],
    waive: true,
    docs: ['cv', 'statement', 'photo'],
    notes: [
      [380, 'office-hours', 'CS 143', 'Asked why open addressing degrades near load factor 0.7 and then measured it herself; brought a plot the next week.'],
      [300, 'class', 'CS 332', 'Best scheduler project in the class: added a priority-inversion test nobody asked for.'],
      [180, 'ta', 'CS 143', 'Students in her section rated her 4.9/5; rewrote the debugging worksheet, which I now use.'],
      [20, 'other', '', 'Mentioned she is leaning toward storage systems for ML.'],
    ],
    askedDaysAgo: 26,
  },
  {
    name: 'Daniel Reyes',
    email: 'dreyes@example.edu',
    pronouns: 'he/him',
    howKnown: 'CS 373 Algorithms with you in Fall 2025. I came to office hours a few times.',
    courses: [C('CS 373', 'Algorithms', 'Fall 2025', 'B+')],
    programs: [['Acme Robotics, Software Engineering Internship', 'Internship', 2, 'Reference form link sent by email', 'They want strong algorithms and C++.', 'new']],
    highlights: 'My final project on route planning.',
    answers: ['That I can turn an algorithm into working code; my A* route planner handled the full city map.', 'I got a C in Calculus II during a family emergency.'],
    scope: ['grades', 'performance'],
    waive: true,
    docs: ['cv', 'statement'],
    notes: [[60, 'project', 'CS 373', 'Route-planning project used A* with a landmark heuristic; clean write-up.']],
    askedDaysAgo: 3,
  },
  {
    name: 'Priya Natarajan',
    email: 'priya.n@example.edu',
    pronouns: 'she/her',
    howKnown: 'Undergraduate research with you on autograder feedback for two quarters, and CS 143.',
    courses: [C('CS 143', 'Data Structures', 'Spring 2024', '4.0'), C('CS 499', 'Undergraduate Research', 'Autumn 2025', '4.0', 'research assistant'), C('CS 499', 'Undergraduate Research', 'Winter 2026', '4.0', 'research assistant')],
    programs: [
      ['Coastal University, PhD in Computing Education', 'PhD', 40, 'Interfolio', 'Computing education research; my work on hint timing.', 'accepted'],
      ['National Science Foundation GRFP', 'Fellowship', 12, 'Fastlane-style reference portal, link by email', 'Intellectual merit and broader impacts: tutoring program she started.', 'submitted'],
    ],
    highlights: 'Research independence and the paper draft.',
    answers: ['That I can run a study end to end: I designed the hint-timing experiment and analyzed 1,200 submissions.', ''],
    scope: ['grades', 'performance', 'conduct', 'transcript'],
    waive: true,
    docs: ['cv', 'statement', 'transcript'],
    notes: [
      [240, 'research', 'CS 499', 'Proposed the hint-delay manipulation herself after reading the help-seeking literature.'],
      [150, 'research', 'CS 499', 'Ran the 1,200-submission analysis; caught a duplicate-submission bug in our pipeline.'],
      [90, 'other', '', 'Started a peer tutoring night for first-generation students; 30 regulars.'],
    ],
    askedDaysAgo: 30,
  },
  {
    name: 'Tom Becker',
    email: 'tbecker@example.edu',
    pronouns: '',
    howKnown: 'I was in your CS 142 class two years ago.',
    courses: [C('CS 142', 'Intro Programming', 'Fall 2023', 'B')],
    programs: [['Bayview Business School, MBA', 'MBA', 9, 'Recommender form by email', '', 'declined']],
    highlights: '',
    answers: ['Hard work.', ''],
    scope: ['performance'],
    waive: false,
    docs: ['cv', 'statement'],
    notes: [],
    askedDaysAgo: 6,
  },
  {
    name: 'Lena Fischer',
    email: 'lena.fischer@example.edu',
    pronouns: 'she/her',
    howKnown: 'CS 332 Operating Systems, and I was on the team that won your class hackathon.',
    courses: [C('CS 332', 'Operating Systems', 'Winter 2026', 'A')],
    programs: [
      ['Harbor City University, MS in Software Engineering', 'MS', -3, 'Email to admissions', 'Industry-focused MS with a capstone.', 'accepted'],
      ['Riverside University, MS Computer Science', 'MS', 45, 'Portal link by email', '', 'new'],
    ],
    highlights: 'Teamwork and leading the hackathon team.',
    answers: ['That I lead well under pressure: I organized our hackathon team and we shipped a working kernel module in 24 hours.', ''],
    scope: ['grades', 'performance', 'conduct'],
    waive: true,
    docs: ['cv', 'statement'],
    notes: [[120, 'class', 'CS 332', 'Led the winning hackathon team; split work cleanly and presented clearly.']],
    askedDaysAgo: 40,
  },
];

function attachment(kind: Attachment['kind'], student: string): Attachment {
  const ext = kind === 'photo' ? 'svg' : 'txt';
  const text =
    kind === 'photo'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#cfe3dd"/><text x="60" y="70" font-size="40" text-anchor="middle" font-family="sans-serif">${student
          .split(' ')
          .map((p) => p[0])
          .join('')}</text></svg>`
      : `${student}\n\nDemo ${kind} for Letter Ledger. Everything in this file is invented.\n`;
  const bytes = utf8(text);
  return { id: `demo-${kind}`, kind, name: `${student.toLowerCase().replace(/\s+/g, '-')}-${kind}.${ext}`, type: kind === 'photo' ? 'image/svg+xml' : 'text/plain', size: bytes.length, data: toBase64(bytes) };
}

export async function demoLedger(policy: Policy, today: string): Promise<Ledger> {
  let l = emptyLedger();
  for (const [i, d] of STUDENTS.entries()) {
    const asked = addDays(today, -d.askedDaysAgo);
    const programs: Program[] = d.programs.map(([name, kind, dueIn, method, tailoring], j) => ({ id: `p${j + 1}`, name, kind, url: '', deadline: addDays(today, dueIn), method, tailoring }));
    const release = await buildRelease(policy, { student: d.name, programs, scope: d.scope, waive: d.waive, date: asked }, d.name, true, `${asked}T15:00:00.000Z`);
    const packet: RequestPacket = {
      v: 1,
      id: `demo-${i + 1}`,
      createdAt: `${asked}T15:00:00.000Z`,
      student: { name: d.name, email: d.email, studentId: '', pronouns: d.pronouns, howKnown: d.howKnown },
      programs,
      courses: d.courses,
      highlights: d.highlights,
      answers: d.answers,
      attachments: d.docs.map((k) => attachment(k, d.name)),
      release,
      questions: policy.questions,
    };
    const added = addPacket(l, packet, asked);
    l = added.ledger;
    const sid = added.request.studentId;
    for (const [j, n] of d.notes.entries()) l = addNote(l, sid, { date: addDays(today, -n[0]), tag: n[1], course: n[2], text: n[3] }, `demo-${i + 1}-n${j + 1}`);
    for (const [j, p] of d.programs.entries()) {
      if (p[5] !== 'new') l = setStatus(l, packet.id, `p${j + 1}`, p[5], addDays(today, -1));
    }
    if (i === 2) l = markNotified(l, packet.id);
    if (i === 0) l = setProgramNotes(l, packet.id, 'p1', 'Mention the storage-for-ML interest; their group has a new grant in that area.');
  }
  // A student with notes but no request yet: the professor captured them during the term.
  const extra = { id: 'demo-term', name: 'Sam Whitfield', email: 'swhitfield@example.edu', notes: [], courses: [C('CS 143', 'Data Structures', 'Autumn 2026', '', 'student')] };
  l = { ...l, students: [...l.students, extra] };
  l = addNote(l, 'demo-term', { date: addDays(today, -9), tag: 'office-hours', course: 'CS 143', text: 'Great question in office hours on hashing: why Java uses 31 in String.hashCode.' }, 'demo-term-n1');
  l = addNote(l, 'demo-term', { date: addDays(today, -2), tag: 'class', course: 'CS 143', text: 'Explained amortized doubling to the whole class better than I did.' }, 'demo-term-n2');
  return l;
}
