// Exam-question generator. Templates are mutated with a seeded RNG, every
// candidate is run through the interpreter and the schedule enumerator, and
// a question is kept only when its answer is unambiguous: the count is the
// same in every schedule, and each "possible output" option is checked
// exactly. Exports Markdown and QTI 1.2 (the format Canvas imports).

import { runSource, type BufMode, type RunResult } from './interp';
import { enumerate, isPossible } from './schedule';

export type QuestionKind = 'count' | 'possible';

export interface Option {
  text: string;
  correct: boolean;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  code: string;
  mode: BufMode;
  prompt: string;
  /** For 'count': the number. */
  answer?: number;
  /** For 'possible': options, each verified. */
  options?: Option[];
  explanation: string;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

interface Candidate {
  code: string;
  mode: BufMode;
  /** Text whose occurrences are counted. */
  token: string;
}

const HEAD = '#include <stdio.h>\n#include <stdlib.h>\n#include <sys/wait.h>\n#include <unistd.h>\n\nint main(void) {\n';
const TAIL = '    return 0;\n}';

const TEMPLATES: ((r: () => number) => Candidate)[] = [
  // Forks in a loop, print after or inside.
  (r) => {
    const n = int(r, 2, 4);
    const nl = r() < 0.6;
    const inside = r() < 0.4;
    const word = pick(r, ['hi', 'x', 'go', 'ok']);
    const print = `printf("${word}${nl ? '\\n' : ''}");`;
    const body = inside
      ? `    for (int i = 0; i < ${n}; i++) {\n        fork();\n        ${print}\n    }\n`
      : `    for (int i = 0; i < ${n}; i++)\n        fork();\n    ${print}\n`;
    return { code: HEAD + body + TAIL, mode: r() < 0.25 ? 'full' : 'line', token: word };
  },
  // Print before fork, with or without a newline.
  (r) => {
    const nl = r() < 0.5;
    const forks = int(r, 1, 2);
    let body = `    printf("A${nl ? '\\n' : ''}");\n`;
    for (let i = 0; i < forks; i++) body += '    fork();\n';
    body += '    printf("B\\n");\n';
    return { code: HEAD + body + TAIL, mode: r() < 0.4 ? 'full' : 'line', token: 'A' };
  },
  // Short-circuit fork expressions.
  (r) => {
    const exprs = ['fork() && fork()', 'fork() || fork()', 'fork() && fork() || fork()', 'fork() || fork() && fork()', '(fork() || fork()) && fork()'];
    const e = pick(r, exprs);
    const body = `    ${e};\n    printf("*\\n");\n`;
    return { code: HEAD + body + TAIL, mode: 'line', token: '*' };
  },
  // Child prints, parent maybe waits.
  (r) => {
    const waits = r() < 0.6;
    const childExits = r() < 0.7;
    let body = '    if (fork() == 0) {\n        printf("C\\n");\n';
    if (childExits) body += '        exit(0);\n';
    body += '    }\n';
    if (waits) body += '    wait(NULL);\n';
    body += '    printf("P\\n");\n';
    return { code: HEAD + body + TAIL, mode: 'line', token: 'P' };
  },
  // Nested fork on the return value.
  (r) => {
    const n = int(r, 1, 2);
    let body = '    pid_t p = fork();\n    if (p == 0) {\n';
    for (let i = 0; i < n; i++) body += '        fork();\n';
    body += '        printf("c\\n");\n    } else {\n        printf("p\\n");\n    }\n';
    return { code: HEAD + body + TAIL, mode: 'line', token: 'c' };
  },
  // Loop counter printed after each fork.
  (r) => {
    const n = int(r, 2, 3);
    const body = `    for (int i = 0; i < ${n}; i++) {\n        fork();\n        printf("%d\\n", i);\n    }\n`;
    return { code: HEAD + body + TAIL, mode: r() < 0.3 ? 'full' : 'line', token: String(n - 1) };
  },
  // Print, fork, then parent and child print different things.
  (r) => {
    const waits = r() < 0.5;
    let body = '    printf("start\\n");\n    if (fork() == 0) {\n        printf("child\\n");\n';
    if (r() < 0.5) body += '        printf("bye\\n");\n';
    body += '        exit(0);\n    }\n';
    if (waits) body += '    wait(NULL);\n';
    body += '    printf("parent\\n");\n';
    return { code: HEAD + body + TAIL, mode: 'line', token: 'start' };
  },
  // A pipe as a one-way barrier: what the read orders and what it does not.
  (r) => {
    const childFirst = r() < 0.5;
    const parentAfter = r() < 0.6;
    const waits = r() < 0.5;
    let body = '    int fd[2];\n    char c;\n    pipe(fd);\n    if (fork() == 0) {\n        close(fd[1]);\n';
    if (childFirst) body += '        printf("C1\\n");\n';
    body += '        read(fd[0], &c, 1);\n        printf("C2\\n");\n        exit(0);\n    }\n';
    body += '    close(fd[0]);\n    printf("P1\\n");\n    write(fd[1], "x", 1);\n';
    if (parentAfter) body += '    printf("P2\\n");\n';
    body += '    close(fd[1]);\n';
    if (waits) body += '    wait(NULL);\n    printf("P3\\n");\n';
    return { code: HEAD + body + TAIL, mode: 'line', token: 'C' };
  },
];

function countOf(s: string, token: string): number {
  if (!token) return 0;
  let n = 0;
  for (let i = s.indexOf(token); i >= 0; i = s.indexOf(token, i + token.length)) n++;
  return n;
}

const shuffle = <T>(r: () => number, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
};

/** Candidate wrong answers: the true outputs with lines swapped or one line dropped or doubled. */
function distractors(r: () => number, run: RunResult, outputs: string[], want: number): string[] {
  const out = new Set<string>();
  for (let tries = 0; tries < 60 && out.size < want; tries++) {
    const base = pick(r, outputs);
    const lines = base.split(/(?<=\n)/);
    let cand: string;
    const t = r();
    if (t < 0.5 && lines.length > 1) cand = shuffle(r, lines).join('');
    else if (t < 0.75 && lines.length > 1) {
      const k = Math.floor(r() * lines.length);
      cand = lines.filter((_, i) => i !== k).join('');
    } else {
      const k = Math.floor(r() * lines.length);
      cand = [...lines.slice(0, k + 1), lines[k] as string, ...lines.slice(k + 1)].join('');
    }
    if (cand && !outputs.includes(cand) && !isPossible(run, cand)) out.add(cand);
  }
  return [...out];
}

export function generate(seed: number, count = 5): Question[] {
  const r = rng(seed);
  const qs: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; tries < count * 20 && qs.length < count; tries++) {
    const c = (TEMPLATES[tries % TEMPLATES.length] as (r: () => number) => Candidate)(r);
    if (seen.has(c.code + c.mode)) continue;
    seen.add(c.code + c.mode);
    const run = runSource(c.code, { mode: c.mode });
    const en = enumerate(run, 400);
    if (en.truncated) continue;
    const where = c.mode === 'full' ? ' when stdout is redirected to a file' : '';
    const id = `fc-${seed}-${qs.length + 1}`;
    const kind: QuestionKind = r() < 0.75 && en.outputs.length > 1 ? 'possible' : 'count';
    if (kind === 'count') {
      const counts = new Set(en.outputs.map((o) => countOf(o, c.token)));
      if (counts.size !== 1) continue;
      const answer = [...counts][0] as number;
      qs.push({
        id,
        kind,
        code: c.code,
        mode: c.mode,
        prompt: `How many times is "${c.token}" printed${where}?`,
        answer,
        explanation: `${run.procs.length} process${run.procs.length === 1 ? '' : 'es'} run; every schedule prints "${c.token}" ${answer} time${answer === 1 ? '' : 's'}.`,
      });
    } else {
      const right = shuffle(r, en.outputs).slice(0, 2);
      const wrong = distractors(r, run, en.outputs, 4 - right.length);
      if (!wrong.length) continue;
      const options = shuffle(r, [
        ...right.map((text) => ({ text, correct: true })),
        ...wrong.map((text) => ({ text, correct: false })),
      ]);
      qs.push({
        id,
        kind,
        code: c.code,
        mode: c.mode,
        prompt: `Which of these outputs are possible${where}? Select all that apply.`,
        options,
        explanation: `There are ${en.outputs.length} possible output${en.outputs.length === 1 ? '' : 's'} in all; each option was checked against every schedule.`,
      });
    }
  }
  return qs;
}

const fence = (s: string) => '```\n' + (s.endsWith('\n') ? s : s + '\n') + '```';

export function toMarkdown(qs: Question[]): string {
  const parts = ['# Fork Count questions', ''];
  qs.forEach((q, i) => {
    parts.push(`## Question ${i + 1}`, '', q.prompt, '', '```c', q.code, '```', '');
    if (q.kind === 'possible') {
      (q.options as Option[]).forEach((o, k) => {
        parts.push(`**${String.fromCharCode(65 + k)}.**`, '', fence(o.text), '');
      });
      const ans = (q.options as Option[])
        .map((o, k) => (o.correct ? String.fromCharCode(65 + k) : ''))
        .filter(Boolean)
        .join(', ');
      parts.push(`**Answer:** ${ans}. ${q.explanation}`, '');
    } else {
      parts.push(`**Answer:** ${q.answer}. ${q.explanation}`, '');
    }
  });
  return parts.join('\n');
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const html = (s: string) => xmlEscape(s);
const pre = (s: string) => html(`<pre>${html(s)}</pre>`);

export function toQti(qs: Question[], title = 'Fork Count questions'): string {
  const items = qs.map((q) => {
    const mat = html(`<p>${html(q.prompt)}</p>`) + pre(q.code);
    if (q.kind === 'count') {
      return `    <item ident="${q.id}" title="${xmlEscape(q.prompt)}">
      <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>numerical_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation>
        <material><mattext texttype="text/html">${mat}</mattext></material>
        <response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str>
      </presentation>
      <resprocessing>
        <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
        <respcondition continue="No"><conditionvar><varequal respident="response1">${q.answer}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
      </resprocessing>
    </item>`;
    }
    const opts = q.options as Option[];
    const labels = opts
      .map(
        (o, k) =>
          `          <response_label ident="${q.id}-${k}"><material><mattext texttype="text/html">${pre(o.text)}</mattext></material></response_label>`,
      )
      .join('\n');
    const conds = opts
      .map((o, k) => (o.correct ? `<varequal respident="response1">${q.id}-${k}</varequal>` : `<not><varequal respident="response1">${q.id}-${k}</varequal></not>`))
      .join('');
    return `    <item ident="${q.id}" title="${xmlEscape(q.prompt)}">
      <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_answers_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation>
        <material><mattext texttype="text/html">${mat}</mattext></material>
        <response_lid ident="response1" rcardinality="Multiple"><render_choice>
${labels}
        </render_choice></response_lid>
      </presentation>
      <resprocessing>
        <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
        <respcondition continue="No"><conditionvar><and>${conds}</and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
      </resprocessing>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="fork-count" title="${xmlEscape(title)}">
    <section ident="root_section">
${items.join('\n')}
    </section>
  </assessment>
</questestinterop>
`;
}
