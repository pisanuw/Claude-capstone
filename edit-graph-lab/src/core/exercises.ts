// Seeded exercise generator. Every answer is computed by the reference
// implementations in this lab, never typed by hand.

import { myers } from './myers';
import { patience } from './patience';
import { tokenize, type Mode } from './script';
import { hunks, unifiedText } from './unified';

export type Template = 'distance' | 'v-array' | 'patience' | 'hunks';

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'distance', label: 'Predict the edit distance D' },
  { id: 'v-array', label: 'Fill in V[k] after step d' },
  { id: 'patience', label: 'Which diff did patience produce?' },
  { id: 'hunks', label: 'How many hunks will diff -u print?' },
];

export interface Exercise {
  id: string;
  template: Template;
  mode: Mode;
  a: string;
  b: string;
  prompt: string;
  kind: 'number' | 'choice';
  /** Numeric answer, or index into `options`. */
  answer: number;
  options?: string[];
  explanation: string;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

function randomWord(r: () => number, alphabet: string, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += pick(r, alphabet.split(''));
  return s;
}

function distanceQ(r: () => number, id: string): Exercise {
  const a = randomWord(r, 'ABC', int(r, 5, 8));
  const b = randomWord(r, 'ABC', int(r, 5, 8));
  const res = myers(tokenize(a, 'char'), tokenize(b, 'char'));
  return {
    id,
    template: 'distance',
    mode: 'char',
    a,
    b,
    prompt: `Character diff of A = "${a}" and B = "${b}". Only insertions and deletions are allowed (no substitutions). What is the minimum number of edits D?`,
    kind: 'number',
    answer: res.d,
    explanation: `D = ${res.d}: the longest common subsequence has length ${(a.length + b.length - res.d) / 2}, and D = |A| + |B| - 2 * LCS = ${a.length} + ${b.length} - ${a.length + b.length - res.d}.`,
  };
}

function vArrayQ(r: () => number, id: string): Exercise {
  for (;;) {
    const a = randomWord(r, 'ABC', int(r, 5, 7));
    const b = randomWord(r, 'ABC', int(r, 5, 7));
    const res = myers(tokenize(a, 'char'), tokenize(b, 'char'));
    if (res.d < 3) continue;
    const d = int(r, 1, res.d - 1);
    const step = res.steps[d] as (typeof res.steps)[number];
    const entry = pick(r, step.v);
    const full = step.v.map((e) => `V[${e.k}] = ${e.x}`).join(', ');
    return {
      id,
      template: 'v-array',
      mode: 'char',
      a,
      b,
      prompt: `Run Myers' greedy algorithm on A = "${a}" (x axis) and B = "${b}" (y axis), with k = x - y and V[1] = 0 before step 0. After step d = ${d}, what is V[${entry.k}], the furthest x reached on diagonal k = ${entry.k}?`,
      kind: 'number',
      answer: entry.x,
      explanation: `After step ${d}: ${full}.`,
    };
  }
}

function block(name: string, body: string): string[] {
  return [`int ${name}(void) {`, `    ${body}`, '}', ''];
}

const FUNCS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'sigma'];

function shuffled<T>(r: () => number, xs: T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Small C files where patience and Myers disagree. Returns null after too many tries. */
function patienceQ(r: () => number, id: string): Exercise | null {
  for (let tries = 0; tries < 200; tries++) {
    const names = shuffled(r, FUNCS).slice(0, int(r, 3, 4));
    const bodies = new Map(names.map((n) => [n, pick(r, ['return 0;', 'return 1;', 'return -1;', 'return n;'])]));
    let after = names.slice();
    const op = int(r, 0, 2);
    if (op === 0) after = [after[after.length - 1] as string, ...after.slice(0, -1)];
    else if (op === 1) after.splice(int(r, 0, after.length), 0, 'extra');
    else after = shuffled(r, after);
    if (op === 1) bodies.set('extra', pick(r, ['return 0;', 'return 2;']));
    const a = names.flatMap((n) => block(n, bodies.get(n) as string)).join('\n') + '\n';
    const b = after.flatMap((n) => block(n, bodies.get(n) as string)).join('\n') + '\n';
    const ta = tokenize(a, 'line');
    const tb = tokenize(b, 'line');
    const my = unifiedText(myers(ta, tb).script, ta, tb);
    const pa = unifiedText(patience(ta, tb), ta, tb);
    if (my === pa || my === '') continue;
    const patienceFirst = r() < 0.5;
    return {
      id,
      template: 'patience',
      mode: 'line',
      a,
      b,
      prompt: 'Both unified diffs below turn A into B with the same number of edits. Which one did patience diff produce?',
      kind: 'choice',
      options: patienceFirst ? [pa, my] : [my, pa],
      answer: patienceFirst ? 0 : 1,
      explanation: 'Patience matches only lines that occur exactly once on each side (here the function signatures), so it never pairs up braces, blank lines or repeated return statements from different functions. The other diff is Myers.',
    };
  }
  /* c8 ignore next */
  return null;
}

function hunksQ(r: () => number, id: string): Exercise {
  for (;;) {
    const n = int(r, 10, 16);
    const items = Array.from({ length: n }, (_, i) => `line ${i + 1}`);
    const after = items.slice();
    const edits = int(r, 2, 4);
    for (let e = 0; e < edits; e++) {
      const at = int(r, 0, after.length - 1);
      if (r() < 0.5) after.splice(at, 1);
      else after.splice(at, 0, `new ${e + 1}`);
    }
    const a = items.join('\n') + '\n';
    const b = after.join('\n') + '\n';
    const ta = tokenize(a, 'line');
    const tb = tokenize(b, 'line');
    const context = pick(r, [1, 2]);
    const hs = hunks(myers(ta, tb).script, ta, tb, context);
    if (hs.length === 0) continue;
    return {
      id,
      template: 'hunks',
      mode: 'line',
      a,
      b,
      prompt: `Diff A and B line by line and print a unified diff with ${context} line${context === 1 ? '' : 's'} of context (diff -U${context}). Changes whose context would overlap or touch are merged into one hunk. How many hunks are printed?`,
      kind: 'number',
      answer: hs.length,
      explanation: `${hs.length} hunk${hs.length === 1 ? '' : 's'}: ${hs.map((h) => h.header).join(' ')}.`,
    };
  }
}

export function generate(templates: Template[], count: number, seed: number): Exercise[] {
  const r = rng(seed);
  const out: Exercise[] = [];
  if (templates.length === 0) return out;
  for (let i = 0; i < count; i++) {
    const t = templates[i % templates.length] as Template;
    const id = `q${seed}-${i + 1}`;
    const q = t === 'distance' ? distanceQ(r, id) : t === 'v-array' ? vArrayQ(r, id) : t === 'hunks' ? hunksQ(r, id) : patienceQ(r, id);
    if (q) out.push(q);
  }
  return out;
}

const fence = (s: string) => '```\n' + s.replace(/\n$/, '') + '\n```';

function inputs(q: Exercise): string {
  return q.mode === 'char' ? '' : `A:\n\n${fence(q.a)}\n\nB:\n\n${fence(q.b)}\n\n`;
}

export function toMarkdown(qs: Exercise[], title = 'Diff exercises'): string {
  const body = qs
    .map((q, n) => {
      const opts = q.options ? '\n\n' + q.options.map((o, k) => `(${String.fromCharCode(97 + k)})\n\n${fence(o)}`).join('\n\n') : '';
      return `## ${n + 1}. ${(TEMPLATES.find((t) => t.id === q.template) as { label: string }).label}\n\n${inputs(q)}${q.prompt}${opts}\n`;
    })
    .join('\n');
  const key = qs
    .map((q, n) => `${n + 1}. **${q.options ? `(${String.fromCharCode(97 + q.answer)})` : q.answer}**. ${q.explanation}`)
    .join('\n');
  return `# ${title}\n\n${body}\n# Answer key\n\n${key}\n`;
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pre = (code: string) => `<pre>${xmlEscape(code)}</pre>`;

/** QTI 1.2, the dialect Canvas imports. Question HTML is escaped once more inside <mattext>. */
export function toQti(qs: Exercise[], title = 'Edit Graph Lab exercises'): string {
  const meta = (type: string) =>
    `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${type}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`;
  const items = qs.map((q) => {
    const html = (q.mode === 'line' ? `<p>A:</p>${pre(q.a)}<p>B:</p>${pre(q.b)}` : '') + `<p>${xmlEscape(q.prompt)}</p>`;
    const mat = `<material><mattext texttype="text/html">${xmlEscape(html)}</mattext></material>`;
    const outcome = '<outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>';
    if (q.kind === 'number') {
      return `    <item ident="${q.id}" title="${xmlEscape(q.template)}">
      ${meta('numerical_question')}
      <presentation>
        ${mat}
        <response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str>
      </presentation>
      <resprocessing>
        ${outcome}
        <respcondition continue="No"><conditionvar><varequal respident="response1">${q.answer}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
      </resprocessing>
    </item>`;
    }
    const labels = (q.options as string[])
      .map((o, k) => `          <response_label ident="${q.id}-${k}"><material><mattext texttype="text/html">${xmlEscape(pre(o))}</mattext></material></response_label>`)
      .join('\n');
    return `    <item ident="${q.id}" title="${xmlEscape(q.template)}">
      ${meta('multiple_choice_question')}
      <presentation>
        ${mat}
        <response_lid ident="response1" rcardinality="Single"><render_choice>
${labels}
        </render_choice></response_lid>
      </presentation>
      <resprocessing>
        ${outcome}
        <respcondition continue="No"><conditionvar><varequal respident="response1">${q.id}-${q.answer}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
      </resprocessing>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="edit-graph-lab" title="${xmlEscape(title)}">
    <section ident="root_section">
${items.join('\n')}
    </section>
  </assessment>
</questestinterop>
`;
}
