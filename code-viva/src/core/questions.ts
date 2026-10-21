/**
 * Question generation: 4 to 6 questions anchored to one student's own
 * functions, names, guards, data structures and commits. Each candidate is a
 * template filled from facts the analyser found; selection favours variety
 * (different kinds, different functions) and is seeded by the student id so two
 * submissions built from the same starter code still get different questions.
 */

import { KEYWORDS, allFunctions, crypticNames, magicNumbers, snippet, type DataStructure, type FunctionInfo, type Guard } from './code';
import { commitStats, type CommitEvent } from './commits';
import { hash, identifiersIn, mentions, sentences } from './text';
import type { Anchor, Question, QuestionKind, Submission } from './types';

export interface GenerateOptions {
  /** Assignment spec text; functions it names are preferred and its requirements become questions. */
  spec?: string;
  count?: number;
  deadline?: string;
}

interface Candidate {
  q: Question;
  fn: string | null;
  priority: number;
}

const code = (s: string) => `\`${s}\``;

const ALTERNATIVE: Record<DataStructure['kind'], string> = {
  map: 'a list of pairs',
  set: 'a list',
  list: 'a dictionary or set',
  'stack/queue': 'a plain list',
  heap: 'a sorted list',
  sort: 'a single pass without sorting',
};

const DESIGN_CONCEPTS: Record<DataStructure['kind'], string[][]> = {
  map: [['key', 'lookup', 'look up', 'hash', 'map'], ['o(1)', 'constant', 'fast', 'time', 'memory', 'space', 'slow']],
  set: [['duplicate', 'unique', 'membership', 'contain', 'seen', 'visited', 'already'], ['o(1)', 'constant', 'hash', 'fast', 'time', 'slow']],
  list: [['order', 'index', 'append', 'position', 'sequence'], ['time', 'memory', 'o(', 'fast', 'slow', 'search']],
  'stack/queue': [['fifo', 'lifo', 'order', 'first', 'last', 'front', 'back', 'end'], ['o(1)', 'constant', 'pop', 'shift', 'time', 'slow']],
  heap: [['smallest', 'largest', 'priority', 'min', 'max'], ['log', 'o(', 'time', 'fast']],
  sort: [['order', 'sorted', 'compare', 'adjacent', 'neighbo'], ['n log n', 'nlogn', 'log', 'time', 'cost', 'o(']],
};

const EDGE_WORDS = /\b(?:None|null|nullptr|undefined|empty|len|length|size|isEmpty|0|-1|<\s*[12]\b|==\s*[01]\b|<=\s*[01]\b|not\b|!)/;

function anchorFor(fn: FunctionInfo, focus?: number): Anchor {
  const s = snippet(fn, focus);
  return { file: fn.file, line: s.line, snippet: s.text, ...(focus ? { focus } : {}) };
}

function interest(fn: FunctionInfo, specNames: Set<string>): number {
  return fn.complexity * 2 + fn.loops.length + (fn.recursion ? 3 : 0) + fn.structures.length + (specNames.has(fn.name.toLowerCase()) ? 3 : 0) + Math.min(fn.source.length, 40) / 10;
}

function trivial(fn: FunctionInfo): boolean {
  if (/^(?:__\w+__|main|toString|equals|hashCode|constructor|get[A-Z]\w*|set[A-Z]\w*|__repr__|__str__)$/.test(fn.name)) return fn.complexity < 3;
  return fn.complexity < 2 && fn.source.length < 5 && !fn.structures.length;
}

function codeIdentifiers(text: string, fn: FunctionInfo): string[] {
  const known = new Set([...fn.params, ...fn.locals, fn.name]);
  const tokens = identifiersIn(text).filter((t) => !KEYWORDS.has(t) && !/^(?:None|nil|NULL|undefined|Error|ValueError)$/.test(t));
  return [...tokens.filter((t) => known.has(t)), ...tokens.filter((t) => !known.has(t) && t.length > 2)].slice(0, 4);
}

/** The condition of a guard line, without its body or trailing colon/brace. */
export function conditionText(line: string): string {
  const m = /^(?:\}\s*)?(?:else\s+)?(?:if|while)\s*\(/.exec(line);
  if (m) {
    let depth = 0;
    for (let k = m[0].length - 1; k < line.length; k++) {
      if (line[k] === '(') depth++;
      else if (line[k] === ')' && --depth === 0) return line.slice(line.search(/(?:if|while)/), k + 1);
    }
  }
  return line.replace(/\s*[{:]\s*$/, '');
}

function signature(fn: FunctionInfo): string {
  return `${fn.name}(${fn.params.join(', ')})`;
}

function traceQ(fn: FunctionInfo): Question {
  return {
    id: `trace-${fn.name}-${fn.startLine}`,
    kind: 'trace',
    prompt: `Walk through ${code(signature(fn))} on a small input you choose. Say what the input is, what happens on each pass through the code, and what it returns.`,
    anchor: anchorFor(fn),
    identifiers: [...fn.params, ...fn.locals.slice(0, 3)].slice(0, 5),
    concepts: [['return', 'result', 'output', 'gives', 'ends'], ['first', 'then', 'next', 'each', 'loop', 'iterat', 'step', 'after', 'call']],
    followUps: {
      specifics: `Name the variables in ${code(fn.name)} you are tracking and give their values after the first step.`,
      concept: `You have not said what ${code(fn.name)} returns for your example. What exactly comes back?`,
      depth: `Pick one concrete input (for example a list of three items) and go through ${code(fn.name)} line by line.`,
    },
  };
}

function recursionQ(fn: FunctionInfo, call: Guard): Question {
  return {
    id: `recursion-${fn.name}-${call.line}`,
    kind: 'recursion',
    prompt: `${code(fn.name)} calls itself on line ${call.line}. What is the base case, and why does every call get closer to it?`,
    anchor: { ...anchorFor(fn, call.line), focus: call.line },
    identifiers: [fn.name, ...fn.params].slice(0, 4),
    concepts: [['base case', 'base', 'stop', 'terminat', 'ends', 'empty', 'none', 'null', 'zero'], ['smaller', 'shrink', 'closer', 'half', 'decreas', 'reduc', 'less', 'fewer', 'shorter', 'minus', '- 1', 'next']],
    followUps: {
      specifics: `Point to the line of ${code(fn.name)} that stops the recursion and say what the arguments look like at that point.`,
      concept: `You have not said why the recursion ends. What gets smaller on each call to ${code(fn.name)}?`,
      depth: `How many calls does ${code(fn.name)} make for an input of size 4? Sketch them.`,
    },
  };
}

function edgeQ(fn: FunctionInfo, guard: Guard): Question {
  const ids = codeIdentifiers(conditionText(guard.text), fn);
  return {
    id: `edge-${fn.name}-${guard.line}`,
    kind: 'edge',
    prompt: `Line ${guard.line} of ${code(fn.name)} is ${code(conditionText(guard.text))}. What input makes this condition true, and what would go wrong if you deleted the check?`,
    anchor: anchorFor(fn, guard.line),
    identifiers: ids.slice(0, 4),
    concepts: [['empty', 'none', 'null', 'zero', 'negative', 'missing', 'out of', 'bound', 'single', 'one element', 'last', 'first', 'end', 'equal', 'same', 'duplicate', 'larger', 'smaller', 'greater', 'less'], ['crash', 'error', 'exception', 'wrong', 'fail', 'infinite', 'index', 'attributeerror', 'pointer', 'segfault', 'undefined', 'break', 'incorrect', 'miss', 'skip', 'never']],
    followUps: {
      specifics: `Give a concrete value of ${ids.slice(0, 2).map(code).join(' or ') || 'the input'} that makes the condition on line ${guard.line} true.`,
      concept: 'You have not said what would break without that check. What error or wrong result would appear?',
      depth: `Walk through ${code(fn.name)} with that input once with the check and once without it.`,
    },
  };
}

function magicQ(fn: FunctionInfo, guard: Guard): Question {
  const num = /(?:^|[^\w.])((?:[3-9]|[1-9]\d+)(?:\.\d+)?)(?![\w.])/.exec(guard.text.replace(/\[[^\]]*\]/g, ''))?.[1] ?? 'that number';
  return {
    id: `edge-${fn.name}-${guard.line}-const`,
    kind: 'edge',
    prompt: `Line ${guard.line} of ${code(fn.name)} uses the constant ${code(num)}. Where does that value come from, and what happens for an input where it would need to be different?`,
    anchor: anchorFor(fn, guard.line),
    identifiers: [num, ...codeIdentifiers(guard.text, fn).slice(0, 2)],
    concepts: [['spec', 'assignment', 'requir', 'because', 'size', 'limit', 'max', 'length', 'count', 'test'], ['different', 'change', 'larger', 'smaller', 'wrong', 'break', 'fail', 'constant', 'variable', 'parameter']],
    followUps: {
      specifics: `What does ${code(num)} stand for in ${code(fn.name)}? Name the quantity.`,
      concept: `Give an input where ${code(num)} would be the wrong value, and say what ${code(fn.name)} would then do.`,
      depth: `How would you change ${code(fn.name)} so the value is not hard-coded?`,
    },
  };
}

function designQ(fn: FunctionInfo, ds: DataStructure): Question {
  const what = ds.kind === 'sort' ? `you sort on line ${ds.line}` : `you keep ${ds.name ? code(ds.name) : 'your data'} in a ${ds.kind === 'stack/queue' ? 'stack or queue' : ds.kind} (line ${ds.line})`;
  return {
    id: `design-${fn.name}-${ds.line}`,
    kind: 'design',
    prompt: `In ${code(fn.name)} ${what}. Why that choice rather than ${ALTERNATIVE[ds.kind]}, and what does it cost in time or memory?`,
    anchor: anchorFor(fn, ds.line),
    identifiers: [ds.name ?? fn.name, fn.name].filter((x, i, a) => a.indexOf(x) === i),
    concepts: DESIGN_CONCEPTS[ds.kind],
    followUps: {
      specifics: `Which operation on ${ds.name ? code(ds.name) : 'that structure'} does ${code(fn.name)} perform most often?`,
      concept: `Compare the cost of that operation with ${ALTERNATIVE[ds.kind]}. Which is faster, and by how much as the input grows?`,
      depth: `What would you have to change in ${code(fn.name)} to use ${ALTERNATIVE[ds.kind]} instead?`,
    },
  };
}

function namingQ(fn: FunctionInfo, name: string): Question {
  const lineIdx = fn.source.findIndex((l, k) => k > 0 && new RegExp(`\\b${name}\\b`).test(l));
  const line = fn.startLine + Math.max(lineIdx, 0);
  return {
    id: `naming-${fn.name}-${name}`,
    kind: 'naming',
    prompt: `In ${code(fn.name)}, what does ${code(name)} hold (first used on line ${line})? What would be a clearer name for it?`,
    anchor: anchorFor(fn, line),
    identifiers: [name],
    concepts: [['hold', 'store', 'contain', 'point', 'refer', 'count', 'index', 'keep', 'track', 'value', 'result', 'node', 'list', 'total', 'sum', 'position', 'copy']],
    followUps: {
      specifics: `What is the value of ${code(name)} right after line ${line} for a small example input?`,
      concept: `You have not said what ${code(name)} represents. Is it a count, an index, a node, a partial result, something else?`,
      depth: `Where else in ${code(fn.name)} is ${code(name)} read or changed, and why there?`,
    },
  };
}

function scaleQ(fn: FunctionInfo): Question {
  const loop = fn.loops[0];
  return {
    id: `scale-${fn.name}-${fn.startLine}`,
    kind: 'scale',
    prompt: `If the input to ${code(fn.name)} were 1,000 times larger, which part would dominate the running time, and roughly how would the time grow?`,
    anchor: anchorFor(fn, loop?.line),
    identifiers: [fn.name, ...fn.params].slice(0, 3),
    concepts: [['o(', 'linear', 'quadratic', 'n^2', 'n squared', 'n*n', 'log', 'constant', 'grow', 'double', 'times', 'proportional', 'exponential'], ['loop', 'nested', 'iterat', 'each', 'call', 'recurs', 'pass', 'line']],
    followUps: {
      specifics: `Point to the line in ${code(fn.name)} that runs the most times.`,
      concept: 'Put a number on it: if the input doubles, does the time double, quadruple, or something else?',
      depth: `How would you make ${code(fn.name)} faster, and what would it cost?`,
    },
  };
}

function commitQ(ev: CommitEvent, fn: FunctionInfo | null): Question {
  const target = fn ? code(fn.name) : ev.file ? code(ev.file) : 'that code';
  return {
    id: `commit-${ev.sha.slice(0, 7)}`,
    kind: 'commit',
    prompt: `${ev.reason} Walk me through how you developed ${target}: what did you write first, what did you try that did not work, and what did you change after testing?`,
    anchor: fn ? anchorFor(fn) : null,
    identifiers: fn ? [fn.name, ...fn.params].slice(0, 3) : [],
    concepts: [['first', 'start', 'began', 'initially', 'before'], ['test', 'bug', 'fix', 'error', 'fail', 'debug', 'tried', 'didn', 'changed', 'wrong', 'broke']],
    followUps: {
      specifics: fn ? `Which part of ${code(fn.name)} did you write last, and why?` : 'Which function did you write last, and why?',
      concept: 'Describe one bug you hit while writing this and how you found it.',
      depth: fn ? `If you had to rewrite ${code(fn.name)} from scratch now, what would you do differently?` : 'If you rewrote it from scratch now, what would you do differently?',
    },
  };
}

function specQ(requirement: string, fn: FunctionInfo | null): Question {
  return {
    id: `spec-${hash(requirement).slice(0, 8)}`,
    kind: 'spec',
    prompt: `The assignment says: "${requirement}" Show where your code does this${fn ? ` (start from ${code(fn.name)})` : ''} and explain how you know it works.`,
    anchor: fn ? anchorFor(fn) : null,
    identifiers: fn ? [fn.name] : [],
    concepts: [['line', 'function', 'method', 'here', 'where', 'call'], ['test', 'tried', 'check', 'example', 'case', 'input', 'output', 'because']],
    followUps: {
      specifics: 'Name the function and line that handles this requirement.',
      concept: 'How did you check it works? Give the input you tried and what came out.',
      depth: 'What input would most likely break this part, and what would happen?',
    },
  };
}

const GENERIC: Question = {
  id: 'generic-hardest',
  kind: 'trace',
  prompt: 'Which part of your submission was hardest to get right? Describe what you tried first, what went wrong, and how you fixed it.',
  anchor: null,
  identifiers: [],
  concepts: [['first', 'tried', 'start', 'began'], ['bug', 'fix', 'wrong', 'error', 'fail', 'test', 'changed']],
  followUps: {
    specifics: 'Name the function or file where that happened.',
    concept: 'What exactly was wrong, and how did you notice?',
    depth: 'How did you test it afterwards?',
  },
};

/** Requirement-like sentences in the spec (must/should/handle/complexity), with the functions they name. */
export function specRequirements(spec: string): string[] {
  return sentences(spec.replace(/^\s*[-*\d.]+\s+/gm, ''))
    .filter((s) => /\b(?:must|should|required?|handle|raise|throw|return|O\([^)]*\)|without|at most|in place|edge case)\b/i.test(s))
    .filter((s) => s.length >= 20 && s.length <= 240);
}

/** Identifiers named in the spec: backticked code and name( call patterns. */
export function specNames(spec: string): Set<string> {
  const out = new Set<string>();
  for (const m of spec.matchAll(/`([A-Za-z_][\w.]*)(?:\([^`]*\))?`|\b([A-Za-z_]\w*)\(/g)) out.add((m[1] ?? m[2])!.split('.').pop()!.toLowerCase());
  return out;
}

/** True when prose names the function, allowing merge_sort / mergeSort / merge sort spellings. */
function sameName(prose: string, name: string): boolean {
  const flat = name.replace(/_/g, '').toLowerCase();
  if (flat.length < 3) return false;
  return mentions(prose, name) || (prose.match(/[A-Za-z_]\w*/g) ?? []).some((w) => w.replace(/_/g, '').toLowerCase() === flat);
}

function pickGuards(fn: FunctionInfo): Guard[] {
  return [...fn.conditionals].sort((a, b) => Number(EDGE_WORDS.test(b.text)) - Number(EDGE_WORDS.test(a.text)));
}

function candidates(sub: Submission, opts: GenerateOptions): Candidate[] {
  const names = specNames(opts.spec ?? '');
  const every = allFunctions(sub.files);
  const fns = every.filter((f) => !trivial(f));
  const ranked = [...fns].sort((a, b) => interest(b, names) - interest(a, names));
  const out: Candidate[] = [];
  const add = (q: Question, fn: FunctionInfo | null, priority: number) => out.push({ q, fn: fn ? `${fn.file}:${fn.name}:${fn.startLine}` : null, priority });

  const stats = commitStats(sub.commits, opts.deadline);
  const ev = stats.events[0];
  if (ev) {
    const inFile = ev.file ? ranked.filter((f) => f.file === ev.file || f.file.endsWith(`/${ev.file}`) || ev.file!.endsWith(`/${f.file}`)) : [];
    add(commitQ(ev, inFile[0] ?? ranked[0] ?? null), inFile[0] ?? null, ev.severity >= 2 ? 100 : 8);
  }

  ranked.slice(0, 6).forEach((fn, rank) => {
    const base = 8 - rank * 0.5;
    if (fn.recursion) add(recursionQ(fn, fn.recursion), fn, base + 2);
    const guard = pickGuards(fn)[0];
    if (guard) add(edgeQ(fn, guard), fn, base + (EDGE_WORDS.test(guard.text) ? 1.5 : 0.5));
    const ds = fn.structures.find((s) => s.name) ?? fn.structures[0];
    if (ds) add(designQ(fn, ds), fn, base + 1);
    const cryptic = crypticNames(fn)[0];
    if (cryptic) add(namingQ(fn, cryptic), fn, base + 0.8);
    const magic = magicNumbers(fn)[0];
    if (magic && magic.line !== guard?.line) add(magicQ(fn, magic), fn, base - 1);
    if (fn.loops.length >= 2 || (fn.loops.length && fn.recursion)) add(scaleQ(fn), fn, base);
    add(traceQ(fn), fn, base + 0.2);
  });

  const reqs = specRequirements(opts.spec ?? '');
  reqs.slice(0, 3).forEach((r, k) => {
    const fn = every.find((f) => sameName(r, f.name)) ?? null;
    add(specQ(r, fn), fn, 5 - k);
  });
  return out;
}

function sortedCandidates(sub: Submission, opts: GenerateOptions): Candidate[] {
  const all = candidates(sub, opts);
  const jitter = (c: Candidate) => parseInt(hash(`${sub.id}|${c.q.id}`).slice(-6), 16) / 0xffffff;
  return all.sort((a, b) => b.priority + jitter(b) * 2.5 - (a.priority + jitter(a) * 2.5));
}

/**
 * Generates the viva questions for one submission. Rules, in order: a severe
 * commit event is always asked about; no two questions of the same kind until
 * every available kind is used; at most two questions per function unless the
 * submission is too small for that; a hash of the student id and question id
 * reorders close candidates, so identical code still gets different questions.
 */
export function generateQuestions(sub: Submission, opts: GenerateOptions = {}): Question[] {
  const count = Math.min(6, Math.max(4, opts.count ?? 5));
  const all = sortedCandidates(sub, opts);
  const chosen: Candidate[] = [];
  const perFn = new Map<string, number>();
  const kinds = new Set<QuestionKind>();
  const ok = (c: Candidate, pass: number) =>
    !chosen.some((x) => x.q.id === c.q.id) && (pass === 2 || !c.fn || (perFn.get(c.fn) ?? 0) < 2) && (pass > 0 || !kinds.has(c.q.kind));
  // Pass 0: new kinds only; pass 1: any kind; pass 2: lift the per-function cap (small submissions).
  for (const pass of [0, 1, 2]) {
    for (const c of all) {
      if (chosen.length >= count) break;
      if (!ok(c, pass)) continue;
      chosen.push(c);
      kinds.add(c.q.kind);
      if (c.fn) perFn.set(c.fn, (perFn.get(c.fn) ?? 0) + 1);
    }
  }
  // The commit question goes last: it is the most personal, and earlier answers warm the student up.
  const qs = chosen.map((c) => c.q).sort((a, b) => Number(a.kind === 'commit') - Number(b.kind === 'commit'));
  if (qs.length < 4 && !qs.some((q) => q.id === GENERIC.id)) qs.push(GENERIC);
  return qs;
}

/**
 * The best question not already in `current`, for the instructor's "replace"
 * button: a kind not yet asked if there is one, else any unused candidate.
 */
export function nextCandidate(sub: Submission, opts: GenerateOptions, current: Question[]): Question | null {
  const ids = new Set(current.map((q) => q.id));
  const kinds = new Set(current.map((q) => q.kind));
  const unused = sortedCandidates(sub, opts).filter((c) => !ids.has(c.q.id));
  return (unused.find((c) => !kinds.has(c.q.kind)) ?? unused[0])?.q ?? null;
}
