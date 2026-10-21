/**
 * Lightweight source analysis: find the functions in a student's files and the
 * facts a viva question can be anchored to (loops, guards, recursion, data
 * structures, cryptic names). It is regex and brace matching over a copy of the
 * source with comments and string contents blanked, so it never runs code and
 * tolerates files that do not compile.
 */

import type { SourceFile } from './types';

export type Lang = 'python' | 'javascript' | 'java' | 'c' | 'other';

const EXT: Record<string, Lang> = {
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  java: 'java',
  kt: 'java',
  cs: 'java',
  c: 'c',
  h: 'c',
  cc: 'c',
  cpp: 'c',
  cxx: 'c',
  hpp: 'c',
  go: 'c',
  rs: 'c',
  swift: 'c',
};

export function langOf(path: string): Lang {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return (m && EXT[m[1]!.toLowerCase()]) || 'other';
}

export function isCode(path: string): boolean {
  return langOf(path) !== 'other';
}

/**
 * Returns the source with comment text and string contents replaced by spaces.
 * Quotes and newlines survive, so offsets and line numbers still line up.
 */
export function mask(src: string, lang: Lang): string {
  const out = src.split('');
  const n = src.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    const two = src.slice(i, i + 2);
    if (lang === 'python' && c === '#') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (lang !== 'python' && two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (lang !== 'python' && two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      blank(i, stop);
      i = stop;
    } else if (lang === 'python' && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      const end = src.indexOf(q, i + 3);
      const stop = end < 0 ? n : end + 3;
      blank(i + 3, stop - 3);
      i = stop;
    } else if (c === '"' || c === "'" || (c === '`' && lang === 'javascript')) {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n' && c !== '`') break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

export interface Guard {
  line: number;
  text: string;
}

export interface DataStructure {
  kind: 'map' | 'set' | 'list' | 'stack/queue' | 'heap' | 'sort';
  line: number;
  text: string;
  /** Variable the structure is stored in, when the line is an assignment. */
  name: string | null;
}

export interface FunctionInfo {
  name: string;
  file: string;
  lang: Lang;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  params: string[];
  /** Raw source lines of the whole function. */
  source: string[];
  loops: Guard[];
  conditionals: Guard[];
  returns: number;
  recursion: Guard | null;
  calls: string[];
  locals: string[];
  structures: DataStructure[];
  complexity: number;
}

const NOT_FUNCTIONS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'synchronized', 'using', 'foreach',
  'lock', 'fixed', 'function', 'elif', 'else', 'do', 'try', 'new', 'typeof', 'match', 'with',
]);

export const KEYWORDS = new Set([
  ...NOT_FUNCTIONS, 'def', 'class', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'self', 'this', 'null',
  'true', 'false', 'int', 'long', 'double', 'float', 'char', 'bool', 'boolean', 'void', 'var', 'let', 'const', 'auto',
  'String', 'public', 'private', 'protected', 'static', 'final', 'struct', 'print', 'println', 'printf', 'len', 'range',
  'lambda', 'pass', 'break', 'continue', 'yield', 'await', 'async', 'import', 'from', 'as', 'throw', 'throws', 'raise',
  'super', 'std', 'size_t', 'unsigned', 'signed', 'out', 'System', 'console', 'log', 'Math', 'Integer', 'Object',
]);

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset && k < text.length; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

function matchClose(text: string, open: number, a: string, b: string): number {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === a) depth++;
    else if (text[k] === b && --depth === 0) return k;
  }
  return text.length - 1;
}

function splitParams(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.replace(/=.*$/s, '').replace(/:.*$/s, '').trim())
    .map((p) => {
      const words = p.match(/[A-Za-z_]\w*/g) ?? [];
      return words[words.length - 1] ?? '';
    })
    .filter((p) => p && p !== 'self' && p !== 'cls' && p !== 'void');
}

interface Span {
  name: string;
  params: string[];
  start: number;
  end: number;
}

function pythonSpans(masked: string): Span[] {
  const lines = masked.split('\n');
  const spans: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(lines[i]!);
    if (!m) continue;
    const indent = m[1]!.length;
    const rest = lines.slice(i).join('\n');
    const open = rest.indexOf('(');
    const close = matchClose(rest, open, '(', ')');
    const params = splitParams(rest.slice(open + 1, close));
    let end = i + lineAt(rest, close) - 1;
    for (let j = end + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l.trim()) continue;
      if (l.length - l.trimStart().length <= indent) break;
      end = j;
    }
    spans.push({ name: m[2]!, params, start: i + 1, end: end + 1 });
  }
  return spans;
}

function braceSpans(masked: string): Span[] {
  const spans: Span[] = [];
  const named = /\b([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = named.exec(masked))) {
    const name = m[1]!;
    if (NOT_FUNCTIONS.has(name)) continue;
    const open = m.index + m[0].length - 1;
    const close = matchClose(masked, open, '(', ')');
    const after = masked.slice(close + 1, close + 200);
    const head = /^\s*(?:const\s*)?(?:noexcept\s*)?(?:throws\s+[\w.,\s]+?)?(?::\s*[\w<>[\]|., ]+?)?\s*\{/.exec(after);
    if (!head) continue;
    const before = masked.slice(Math.max(0, m.index - 40), m.index);
    if (/(?:\.|new\s+|=\s*|return\s+)$/.test(before)) continue;
    const brace = close + 1 + head[0].length - 1;
    const end = matchClose(masked, brace, '{', '}');
    spans.push({ name, params: splitParams(masked.slice(open + 1, close)), start: lineAt(masked, m.index), end: lineAt(masked, end) });
  }
  const arrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>\s*\{/g;
  while ((m = arrow.exec(masked))) {
    const brace = m.index + m[0].length - 1;
    const end = matchClose(masked, brace, '{', '}');
    spans.push({ name: m[1]!, params: splitParams(m[2]!.replace(/^\(|\)$/g, '')), start: lineAt(masked, m.index), end: lineAt(masked, end) });
  }
  return spans.sort((a, b) => a.start - b.start);
}

const LOOP = { python: /^\s*(?:for|while)\b/, other: /\b(?:for|while)\s*\(|\bdo\s*\{|\.forEach\s*\(/ };
const COND = { python: /^\s*(?:if|elif)\b/, other: /\b(?:if)\s*\(|\bcase\b[^:]*:|\?[^:;]+:/ };

const STRUCTURES: [DataStructure['kind'], RegExp][] = [
  ['heap', /\bheapq\b|PriorityQueue|priority_queue/],
  ['stack/queue', /\bdeque\b|\bStack\s*<|\bQueue\s*<|\bArrayDeque\b|\bLinkedList\s*<|std::stack|std::queue|\.pop\(0\)|\.shift\(\)/],
  ['map', /\bdict\(|\bdefaultdict\b|\bCounter\(|HashMap|TreeMap|\bMap\s*<|new Map\b|unordered_map|std::map|=\s*\{\s*\}(?!\s*;?\s*\w)/],
  ['set', /\bset\(|HashSet|TreeSet|new Set\b|unordered_set|std::set|\bSet\s*</],
  ['sort', /\bsorted\(|\.sort\(|Arrays\.sort|Collections\.sort|std::sort/],
  ['list', /=\s*\[\s*\]|\bArrayList\b|\bvector\s*<|\bList\s*<|new \w+\[[^\]]+\]/],
];

function assignedName(line: string): string | null {
  const m = /([A-Za-z_]\w*)\s*(?::[^=]*)?=(?!=)/.exec(line);
  return m && !KEYWORDS.has(m[1]!) ? m[1]! : null;
}

function analyse(file: SourceFile, lang: Lang, span: Span, rawLines: string[], maskedLines: string[]): FunctionInfo {
  const body = maskedLines.slice(span.start - 1, span.end);
  const loops: Guard[] = [];
  const conditionals: Guard[] = [];
  const structures: DataStructure[] = [];
  const calls = new Set<string>();
  const locals = new Set<string>();
  let returns = 0;
  let boolOps = 0;
  let recursion: Guard | null = null;
  const loopRe = lang === 'python' ? LOOP.python : LOOP.other;
  const condRe = lang === 'python' ? COND.python : COND.other;
  body.forEach((whole, k) => {
    const lineNo = span.start + k;
    const raw = rawLines[lineNo - 1]!.trim();
    // The header line only counts from its opening brace (one-line bodies).
    const l = k > 0 ? whole : lang === 'python' || !whole.includes('{') ? '' : whole.slice(whole.indexOf('{') + 1);
    if (!l) return;
    if (loopRe.test(l)) loops.push({ line: lineNo, text: raw });
    if (condRe.test(l)) conditionals.push({ line: lineNo, text: raw });
    if (/\breturn\b/.test(l)) returns++;
    boolOps += (l.match(/&&|\|\||\band\b|\bor\b/g) ?? []).length;
    for (const [kind, re] of STRUCTURES) {
      if (re.test(l) && !structures.some((s) => s.kind === kind)) structures.push({ kind, line: lineNo, text: raw, name: assignedName(l) });
    }
    for (const c of l.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*\(/g)) {
      const name = c[1]!;
      if (NOT_FUNCTIONS.has(name)) continue;
      calls.add(name);
      if (name === span.name && !recursion) recursion = { line: lineNo, text: raw };
    }
    const self = new RegExp(`\\b(?:self|this)\\.${span.name}\\s*\\(`);
    if (!recursion && self.test(l)) recursion = { line: lineNo, text: raw };
    const decl =
      lang === 'python'
        ? [...l.matchAll(/^\s*([A-Za-z_]\w*)\s*(?:[-+*/%]?=)(?!=)|\bfor\s+([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s+in\b/g)]
        : [...l.matchAll(/\b(?:let|const|var|int|long|double|float|char|bool|boolean|auto|size_t|String|[A-Z]\w*(?:<[^>]*>)?)(?:\[\])*\s+([a-z_]\w*)\s*(?:=|;|:)/g)];
    for (const d of decl) for (const v of d.slice(1)) if (v && !KEYWORDS.has(v)) locals.add(v);
  });
  return {
    name: span.name,
    file: file.path,
    lang,
    startLine: span.start,
    endLine: span.end,
    params: span.params,
    source: rawLines.slice(span.start - 1, span.end),
    loops,
    conditionals,
    returns,
    recursion,
    calls: [...calls].filter((c) => c !== span.name),
    locals: [...locals],
    structures,
    complexity: 1 + loops.length + conditionals.length + boolOps,
  };
}

/** Every function or method found in a file, outermost first by line. */
export function functionsIn(file: SourceFile): FunctionInfo[] {
  const lang = langOf(file.path);
  if (lang === 'other') return [];
  const masked = mask(file.text, lang);
  const spans = lang === 'python' ? pythonSpans(masked) : braceSpans(masked);
  const rawLines = file.text.split('\n');
  const maskedLines = masked.split('\n');
  return spans.map((s) => analyse(file, lang, s, rawLines, maskedLines));
}

const CLEAR_SHORT = new Set(['i', 'j', 'k', 'n', 'm', 'x', 'y', 'z', 'id', 'ok', 'lo', 'hi', 'dx', 'dy', 'io', 'os', 'db', 'fn', 'e', 'c', 'ch', 'v', 'w', 'h', 'a', 'b', 'p', 'q', 'r', 's', 't', 'u', 'l']);
const VAGUE_NAMES = /^(?:tmp|temp|foo|bar|baz|thing|stuff|data|val|var|obj|res|ret|arr|lst|num|flag|helper|x|y|t|s|a|b)\d+$|^(?:thing|stuff|foo|bar|baz|temp|tmp|flag)$/i;

/** Names that a reader would have to ask about: digits on vague stems, or opaque two-letter names. */
export function crypticNames(fn: FunctionInfo): string[] {
  return fn.locals.filter((v) => VAGUE_NAMES.test(v) || (v.length === 2 && !CLEAR_SHORT.has(v.toLowerCase()) && !/^[a-z][A-Z]$/.test(v)));
}

/** Bare numeric literals other than 0, 1, 2 and -1 that steer control flow. */
export function magicNumbers(fn: FunctionInfo): Guard[] {
  const out: Guard[] = [];
  const masked = mask(fn.source.join('\n'), fn.lang).split('\n');
  masked.forEach((l, k) => {
    if (k === 0) return;
    if (!/\b(?:if|while|for|elif|return)\b|[<>]=?/.test(l)) return;
    if (/(?:^|[^\w.])(?:[3-9]|[1-9]\d+)(?:\.\d+)?(?![\w.])/.test(l.replace(/\[[^\]]*\]/g, ''))) out.push({ line: fn.startLine + k, text: fn.source[k]!.trim() });
  });
  return out;
}

/** Lines of the function around a focus line, capped so the snippet stays readable. */
export function snippet(fn: FunctionInfo, focus?: number, max = 14): { line: number; text: string } {
  const total = fn.source.length;
  if (total <= max) return { line: fn.startLine, text: fn.source.join('\n').replace(/\s+$/, '') };
  const at = focus ? focus - fn.startLine : 0;
  let from = Math.max(0, at - Math.floor(max / 3));
  if (from + max > total) from = total - max;
  return { line: fn.startLine + from, text: fn.source.slice(from, from + max).join('\n').replace(/\s+$/, '') };
}

/** All functions across a submission's code files, skipping obvious tests and generated files. */
export function allFunctions(files: SourceFile[]): FunctionInfo[] {
  return files
    .filter((f) => isCode(f.path) && !/(?:^|\/)(?:tests?|__tests__|node_modules|dist|build|vendor)\//i.test(f.path) && !/(?:_test|\.test|\.spec|Test)\.\w+$/.test(f.path))
    .flatMap(functionsIn);
}

/** Lines of code (non-blank) in the submission's code files. */
export function codeLines(files: SourceFile[]): number {
  return files.filter((f) => isCode(f.path)).reduce((s, f) => s + f.text.split('\n').filter((l) => l.trim()).length, 0);
}
