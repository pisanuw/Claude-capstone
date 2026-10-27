/**
 * Net coding units for a solution: units on added lines minus units on
 * deleted lines, per file and per function, plus complexity of the touched
 * functions and how much of the added code is duplicated.
 */
import { type DiffLine, diffLines } from './diff';
import { TOP_LEVEL, isDecision, scope } from './functions';
import { type Lang, type Token, detectLang, isUnit, tokenize } from './lexer';

export type AuthorKind = 'student' | 'reference' | 'ai' | 'unknown';

export interface SourceFile {
  path: string;
  content: string;
}

export interface Solution {
  id: string;
  label: string;
  author: AuthorKind;
  /** Free text such as "terse" or "defensive"; shown only after the reveal. */
  note: string;
  files: SourceFile[];
  /** Tests passed, entered by the instructor (the tool does not run code). */
  testsPassed: number | null;
}

export interface Assignment {
  title: string;
  description: string;
  starter: SourceFile[];
  testsTotal: number;
  solutions: Solution[];
}

/** Column ranges of counted units on one line, for highlighting. */
export type Spans = Array<[number, number]>;

export interface FunctionStat {
  file: string;
  name: string;
  added: number;
  deleted: number;
  net: number;
  /** McCabe complexity after the change (null when the function was removed). */
  complexity: number | null;
  /** Complexity in the starter (null when the function is new). */
  starterComplexity: number | null;
}

export interface FileStat {
  path: string;
  lang: Lang;
  status: 'modified' | 'added' | 'unchanged';
  added: number;
  deleted: number;
  net: number;
  addedLines: number;
  deletedLines: number;
  diff: DiffLine[];
  /** Highlight spans keyed by line number on each side. */
  oldSpans: Map<number, Spans>;
  newSpans: Map<number, Spans>;
  /** Units on added lines that sit inside a duplicated stretch of code. */
  duplicatedAdded: number;
}

export interface SolutionStat {
  id: string;
  added: number;
  deleted: number;
  net: number;
  netLines: number;
  addedLines: number;
  deletedLines: number;
  /** Branches added: complexity after minus complexity before, over functions with added code. */
  addedBranches: number;
  maxComplexity: number;
  /** Share of the added units that are part of a duplicated stretch (0 to 1). */
  duplication: number;
  files: FileStat[];
  functions: FunctionStat[];
  skipped: string[];
}

/** Length of the normalized token window used to detect copy-paste. */
export const DUP_WINDOW = 12;

interface Parsed {
  tokens: Token[];
  units: Token[];
  owners: string[];
  lineUnits: Map<number, number>;
  spans: Map<number, Spans>;
  complexity: Map<string, number>;
}

function parse(src: string, lang: Lang): Parsed {
  const tokens = tokenize(src, lang);
  const { owners, functions } = scope(tokens, src, lang);
  const lineStarts = [0, 0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineUnits = new Map<number, number>();
  const spans = new Map<number, Spans>();
  const complexity = new Map<string, number>(functions.map((f) => [f.name, 1]));
  const units: Token[] = [];
  tokens.forEach((t, i) => {
    const owner = owners[i] as string;
    if (isDecision(t, lang) && owner !== TOP_LEVEL) complexity.set(owner, (complexity.get(owner) ?? 1) + 1);
    if (!isUnit(t)) return;
    units.push(t);
    lineUnits.set(t.line, (lineUnits.get(t.line) ?? 0) + 1);
    const base = lineStarts[t.line] as number;
    const lineEnd = src.indexOf('\n', t.start);
    const end = lineEnd >= 0 && lineEnd < t.end ? lineEnd : t.end;
    const list = spans.get(t.line) ?? [];
    list.push([t.start - base, end - base]);
    spans.set(t.line, list);
  });
  return { tokens, units, owners, lineUnits, spans, complexity };
}

function normalized(t: Token): string {
  if (t.kind === 'ident') return 'I';
  if (t.kind === 'number') return 'N';
  if (t.kind === 'string') return 'S';
  return t.text;
}

/**
 * Marks unit tokens that belong to a window of DUP_WINDOW normalized units
 * occurring at least twice anywhere in the solution (renamed variables still
 * match, since names and literals are normalized away).
 */
export function duplicatedTokens(files: Token[][]): Set<Token> {
  const seen = new Map<string, Array<[number, number]>>();
  files.forEach((units, f) => {
    const keys = units.map(normalized);
    for (let i = 0; i + DUP_WINDOW <= units.length; i++) {
      const key = keys.slice(i, i + DUP_WINDOW).join('\u0001');
      const list = seen.get(key) ?? [];
      list.push([f, i]);
      seen.set(key, list);
    }
  });
  const marked = new Set<Token>();
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    // Overlapping hits inside one run of repeated tokens (a a a a ...) are not copies.
    const distinct = list.filter(
      ([f, i], k) => k === 0 || f !== (list[k - 1] as [number, number])[0] || i - (list[k - 1] as [number, number])[1] >= DUP_WINDOW,
    );
    if (distinct.length < 2) continue;
    for (const [f, i] of list) {
      const units = files[f] as Token[];
      for (let k = i; k < i + DUP_WINDOW; k++) marked.add(units[k] as Token);
    }
  }
  return marked;
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

const nonBlank = (s: string): boolean => s.trim() !== '';

export function analyzeSolution(starter: SourceFile[], solution: Solution): SolutionStat {
  const base = new Map(starter.map((f) => [normalizePath(f.path), f.content]));
  const skipped: string[] = [];
  const prepared: Array<{ path: string; lang: Lang; old: string; neu: string; status: FileStat['status'] }> = [];
  for (const f of solution.files) {
    const path = normalizePath(f.path);
    const lang = detectLang(path);
    if (!lang) {
      skipped.push(path);
      continue;
    }
    const old = base.get(path);
    prepared.push({
      path,
      lang,
      old: old ?? '',
      neu: f.content,
      status: old === undefined ? 'added' : old === f.content ? 'unchanged' : 'modified',
    });
  }

  const parsedNew = prepared.map((p) => parse(p.neu, p.lang));
  const dup = duplicatedTokens(parsedNew.map((p) => p.units));

  const files: FileStat[] = [];
  const functions: FunctionStat[] = [];
  prepared.forEach((p, idx) => {
    const po = parse(p.old, p.lang);
    const pn = parsedNew[idx] as Parsed;
    const diff = diffLines(p.old, p.neu);
    const addedLineSet = new Set(diff.filter((d) => d.op === 'add').map((d) => d.newLine));
    const deletedLineSet = new Set(diff.filter((d) => d.op === 'del').map((d) => d.oldLine));

    const perFn = new Map<string, { added: number; deleted: number }>();
    const bump = (name: string, key: 'added' | 'deleted'): void => {
      const s = perFn.get(name) ?? { added: 0, deleted: 0 };
      s[key]++;
      perFn.set(name, s);
    };
    let added = 0;
    let duplicatedAdded = 0;
    pn.tokens.forEach((t, i) => {
      if (!isUnit(t) || !addedLineSet.has(t.line)) return;
      added++;
      if (dup.has(t)) duplicatedAdded++;
      bump(pn.owners[i] as string, 'added');
    });
    let deleted = 0;
    po.tokens.forEach((t, i) => {
      if (!isUnit(t) || !deletedLineSet.has(t.line)) return;
      deleted++;
      bump(po.owners[i] as string, 'deleted');
    });

    for (const [name, s] of perFn) {
      functions.push({
        file: p.path,
        name,
        added: s.added,
        deleted: s.deleted,
        net: s.added - s.deleted,
        complexity: name === TOP_LEVEL ? null : (pn.complexity.get(name) ?? null),
        starterComplexity: name === TOP_LEVEL ? null : (po.complexity.get(name) ?? null),
      });
    }

    files.push({
      path: p.path,
      lang: p.lang,
      status: p.status,
      added,
      deleted,
      net: added - deleted,
      addedLines: diff.filter((d) => d.op === 'add' && nonBlank(d.text)).length,
      deletedLines: diff.filter((d) => d.op === 'del' && nonBlank(d.text)).length,
      diff,
      oldSpans: po.spans,
      newSpans: pn.spans,
      duplicatedAdded,
    });
  });

  const sum = (k: 'added' | 'deleted' | 'addedLines' | 'deletedLines' | 'duplicatedAdded'): number =>
    files.reduce((s, f) => s + f[k], 0);
  const added = sum('added');
  const deleted = sum('deleted');
  const touched = functions.filter((f) => f.complexity !== null && f.added > 0);
  return {
    id: solution.id,
    added,
    deleted,
    net: added - deleted,
    addedLines: sum('addedLines'),
    deletedLines: sum('deletedLines'),
    netLines: sum('addedLines') - sum('deletedLines'),
    addedBranches: touched.reduce(
      (s, f) => s + Math.max(0, (f.complexity as number) - (f.starterComplexity ?? 1)),
      0,
    ),
    maxComplexity: touched.reduce((m, f) => Math.max(m, f.complexity as number), 0),
    duplication: added > 0 ? sum('duplicatedAdded') / added : 0,
    files,
    functions: functions.sort((a, b) => b.net - a.net),
    skipped,
  };
}
