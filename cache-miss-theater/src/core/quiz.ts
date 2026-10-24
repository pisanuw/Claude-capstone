// Exam question generator. Templates are perturbed by a seeded RNG (array
// sizes, element types, loop orders, cache geometry) and every answer is
// computed by running the simulator on the exact code shown. Exports Markdown
// and QTI 1.2 (the dialect Canvas imports).

import { Replay, mulberry32, sets, simulate, type CacheConfig } from './cache';
import { buildTrace } from './trace';

export interface Option {
  text: string;
  correct: boolean;
}

export interface Question {
  id: string;
  template: string;
  kind: 'number' | 'choice';
  prompt: string;
  code: string;
  cache: CacheConfig;
  answer: number;
  options?: Option[];
  explanation: string;
}

type Rng = () => number;
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

const TYPES = [
  { name: 'int', size: 4 },
  { name: 'float', size: 4 },
  { name: 'double', size: 8 },
] as const;

export function describeCache(c: CacheConfig): string {
  const assoc = c.ways === c.size / c.lineSize ? 'fully associative' : c.ways === 1 ? 'direct-mapped' : `${c.ways}-way set-associative`;
  const size = c.size >= 1024 ? `${c.size / 1024} KB` : `${c.size} B`;
  return `${size} ${assoc} cache, ${c.lineSize}-byte lines (${sets(c)} set${sets(c) > 1 ? 's' : ''}), ${c.policy.toUpperCase()} replacement, ${c.writeAllocate ? 'write-allocate' : 'no-write-allocate'}, ${c.writeBack ? 'write-back' : 'write-through'}, initially empty`;
}

function cacheFor(r: Rng, ways?: number): CacheConfig {
  const size = pick(r, [256, 512, 1024]);
  const lineSize = pick(r, [16, 32, 64]);
  return { size, lineSize, ways: ways ?? pick(r, [1, 2, 4]), policy: 'lru', writeAllocate: true, writeBack: true, seed: 1 };
}

function misses(code: string, cfg: CacheConfig) {
  return simulate(buildTrace(code), cfg).stats;
}

const LAYOUT = 'Arrays are row-major, the first starts at address 0x10000 and each following array starts at the next 64-byte boundary after the previous one. Scalars live in registers. Reads on the right-hand side happen left to right, before the write.';

function traversal(r: Rng, id: string): Question {
  const t = pick(r, TYPES);
  const rows = pick(r, [8, 16, 32]);
  const cols = pick(r, [8, 16, 32]);
  const colMajor = r() < 0.5;
  const [o, i] = colMajor ? ['j', 'i'] : ['i', 'j'];
  const code = `${t.name} A[${rows}][${cols}];
${t.name} s = 0;
for (int ${o} = 0; ${o} < ${colMajor ? cols : rows}; ${o}++)
  for (int ${i} = 0; ${i} < ${colMajor ? rows : cols}; ${i}++)
    s += A[i][j];`;
  const cache = cacheFor(r);
  const st = misses(code, cache);
  return {
    id,
    template: 'traversal',
    kind: 'number',
    prompt: `How many cache misses does this loop cause on a ${describeCache(cache)}?`,
    code,
    cache,
    answer: st.misses,
    explanation: `${st.accesses} reads, ${st.misses} misses (${st.compulsory} compulsory, ${st.capacity} capacity, ${st.conflict} conflict).`,
  };
}

function stride(r: Rng, id: string): Question {
  const t = pick(r, TYPES);
  const n = pick(r, [256, 512, 1024]);
  const s = pick(r, [1, 2, 4, 8, 16]);
  const code = `${t.name} A[${n}];
${t.name} s = 0;
for (int i = 0; i < ${n}; i += ${s})
  s += A[i];`;
  const cache = cacheFor(r);
  const st = misses(code, cache);
  return {
    id,
    template: 'stride',
    kind: 'number',
    prompt: `How many of the reads hit on a ${describeCache(cache)}?`,
    code,
    cache,
    answer: st.hits,
    explanation: `${st.accesses} reads: ${st.hits} hits and ${st.misses} misses. Each ${cache.lineSize}-byte line holds ${cache.lineSize / t.size} elements and the loop touches ${s === 1 ? 'every one' : `one in every ${s}`}.`,
  };
}

const ORDERS = ['ijk', 'ikj', 'jik', 'jki', 'kij', 'kji'] as const;

function matmulCode(order: string, n: number, t: string): string {
  const lines = [...order].map((v, d) => `${'  '.repeat(d)}for (int ${v} = 0; ${v} < ${n}; ${v}++)`);
  return `${t} A[${n}][${n}], B[${n}][${n}], C[${n}][${n}];
${lines.join('\n')}
${'  '.repeat(3)}C[i][j] += A[i][k] * B[k][j];`;
}

function loopOrder(r: Rng, id: string): Question | null {
  const n = pick(r, [8, 12, 16]);
  const t = pick(r, TYPES);
  const cache = cacheFor(r, pick(r, [2, 4]));
  const shuffled: string[] = [...ORDERS];
  for (let x = shuffled.length - 1; x > 0; x--) {
    const y = Math.floor(r() * (x + 1));
    [shuffled[x], shuffled[y]] = [shuffled[y] as string, shuffled[x] as string];
  }
  const chosen = shuffled.slice(0, 3);
  const results = chosen.map((o) => ({ o, m: misses(matmulCode(o, n, t.name), cache).misses }));
  const best = Math.min(...results.map((x) => x.m));
  if (results.filter((x) => x.m === best).length !== 1) return null;
  return {
    id,
    template: 'loop-order',
    kind: 'choice',
    prompt: `C[i][j] += A[i][k] * B[k][j] for ${n}×${n} ${t.name} matrices, on a ${describeCache(cache)}. Which loop order causes the fewest cache misses?`,
    code: matmulCode('ijk', n, t.name),
    cache,
    answer: results.findIndex((x) => x.m === best),
    options: results.map((x) => ({ text: x.o, correct: x.m === best })),
    explanation: results.map((x) => `${x.o}: ${x.m} misses`).join('; ') + '.',
  };
}

function conflict(r: Rng, id: string): Question {
  const cache: CacheConfig = { ...cacheFor(r, 1), size: pick(r, [512, 1024]) };
  const t = pick(r, TYPES);
  const n = cache.size / t.size;
  const pad = pick(r, [0, 0, cache.lineSize / t.size]);
  const code = `${t.name} X[${n + pad}], Y[${n}];
${t.name} d = 0;
for (int i = 0; i < ${n}; i++)
  d += X[i] * Y[i];`;
  const st = misses(code, cache);
  return {
    id,
    template: 'conflict',
    kind: 'number',
    prompt: `How many of the misses are conflict misses on a ${describeCache(cache)}?`,
    code,
    cache,
    answer: st.conflict,
    explanation: `${st.misses} misses: ${st.compulsory} compulsory, ${st.capacity} capacity, ${st.conflict} conflict.${pad ? ' The padding moves Y off the sets X uses.' : ' X[i] and Y[i] are a whole cache size apart, so they map to the same set.'}`,
  };
}

function whichSet(r: Rng, id: string): Question {
  const t = pick(r, TYPES);
  const rows = pick(r, [16, 32, 64]);
  const cols = pick(r, [16, 32, 64]);
  const i = Math.floor(r() * rows);
  const j = Math.floor(r() * cols);
  const code = `${t.name} A[${rows}][${cols}];
${t.name} x = A[${i}][${j}];`;
  const cache = cacheFor(r);
  const rep = new Replay(buildTrace(code), cache);
  const set = rep.step().result.set;
  const addr = 0x10000 + (i * cols + j) * t.size;
  return {
    id,
    template: 'which-set',
    kind: 'number',
    prompt: `A starts at address 0x10000. Which set of a ${describeCache(cache)} does A[${i}][${j}] map to?`,
    code,
    cache,
    answer: set,
    explanation: `Address 0x10000 + (${i}×${cols} + ${j})×${t.size} = 0x${addr.toString(16)}; line number ${Math.floor(addr / cache.lineSize)}; ${Math.floor(addr / cache.lineSize)} mod ${sets(cache)} = ${set}.`,
  };
}

function classify(r: Rng, id: string): Question {
  const cache = cacheFor(r, pick(r, [1, 2]));
  const t = pick(r, TYPES);
  const n = pick(r, [8, 16]);
  const code = `${t.name} A[${n}][${n}];
${t.name} s = 0;
for (int rep = 0; rep < 2; rep++)
  for (int j = 0; j < ${n}; j++)
    for (int i = 0; i < ${n}; i++)
      s += A[i][j];`;
  const res = simulate(buildTrace(code), cache);
  return {
    id,
    template: 'classify',
    kind: 'number',
    prompt: `The column walk runs twice. How many capacity misses does it cause on a ${describeCache(cache)}?`,
    code,
    cache,
    answer: res.stats.capacity,
    explanation: `${res.stats.misses} misses: ${res.stats.compulsory} compulsory (first touch of each line), ${res.stats.capacity} capacity, ${res.stats.conflict} conflict. The second pass misses only if the ${n}×${n} array (${n * n * t.size} B) does not stay in the cache.`,
  };
}

const TEMPLATES: Record<string, (r: Rng, id: string) => Question | null> = {
  traversal,
  stride,
  'loop-order': loopOrder,
  conflict,
  'which-set': whichSet,
  classify,
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function generate(seed: number, count: number, templates: string[] = TEMPLATE_NAMES): Question[] {
  const r = mulberry32(seed);
  const names = templates.filter((t) => t in TEMPLATES);
  if (!names.length) return [];
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const name = names[out.length % names.length] as string;
    const q = (TEMPLATES[name] as (r: Rng, id: string) => Question | null)(r, `cmt-${seed}-${out.length + 1}`);
    if (!q) continue;
    const key = q.prompt + q.code;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

export function toMarkdown(qs: Question[]): string {
  const body = qs
    .map((q, n) => {
      const opts = q.options ? '\n' + q.options.map((o, k) => `${String.fromCharCode(97 + k)}) ${o.text}`).join('\n') + '\n' : '';
      return `## Question ${n + 1}\n\n${q.prompt}\n\n\`\`\`c\n${q.code}\n\`\`\`\n${opts}`;
    })
    .join('\n');
  const key = qs
    .map((q, n) => {
      const a = q.options ? `${String.fromCharCode(97 + q.answer)}) ${(q.options[q.answer] as Option).text}` : String(q.answer);
      return `${n + 1}. **${a}**. ${q.explanation}`;
    })
    .join('\n');
  return `# Cache questions\n\n${LAYOUT}\n\n${body}\n# Answer key\n\n${key}\n`;
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pre = (code: string) => xmlEscape(`<pre>${xmlEscape(code)}</pre>`);

export function toQti(qs: Question[], title = 'Cache Miss Theater questions'): string {
  const items = qs.map((q) => {
    const mat = xmlEscape(`<p>${xmlEscape(q.prompt)}</p><p>${xmlEscape(LAYOUT)}</p>`) + pre(q.code);
    const meta = (type: string) =>
      `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${type}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`;
    if (q.kind === 'number') {
      return `    <item ident="${q.id}" title="${xmlEscape(q.template)}">
      ${meta('numerical_question')}
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
      .map((o, k) => `          <response_label ident="${q.id}-${k}"><material><mattext texttype="text/plain">${xmlEscape(o.text)}</mattext></material></response_label>`)
      .join('\n');
    return `    <item ident="${q.id}" title="${xmlEscape(q.template)}">
      ${meta('multiple_choice_question')}
      <presentation>
        <material><mattext texttype="text/html">${mat}</mattext></material>
        <response_lid ident="response1" rcardinality="Single"><render_choice>
${labels}
        </render_choice></response_lid>
      </presentation>
      <resprocessing>
        <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
        <respcondition continue="No"><conditionvar><varequal respident="response1">${q.id}-${q.answer}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
      </resprocessing>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="cache-miss-theater" title="${xmlEscape(title)}">
    <section ident="root_section">
${items.join('\n')}
    </section>
  </assessment>
</questestinterop>
`;
}
