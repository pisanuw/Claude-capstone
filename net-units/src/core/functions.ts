/**
 * Assigns every token to the function that contains it and computes
 * cyclomatic complexity per function. Python scopes come from indentation;
 * the C-family languages from braces, recognising `name(...) {` bodies,
 * `function` expressions and `=> {` arrows. This is a heuristic, not a
 * parser: unusual forms (C++ constructor initializer lists, macros) can be
 * attributed to the wrong name, but every token still lands somewhere.
 */
import { type Lang, type Token } from './lexer';

export const TOP_LEVEL = '(top level)';

export interface Scoped {
  /** Owner of each token, by index: a qualified function name or TOP_LEVEL. */
  owners: string[];
  /** Functions in order of first appearance, with their own header line. */
  functions: Array<{ name: string; line: number }>;
}

interface Scope {
  kind: 'fn' | 'class' | 'block';
  name: string;
  indent: number;
}

function qualified(stack: Scope[], name: string): string {
  const parts = stack.filter((s) => s.kind !== 'block').map((s) => s.name);
  return [...parts, name].join('.');
}

function currentOwner(stack: Scope[]): string {
  for (let i = stack.length - 1; i >= 0; i--) {
    if ((stack[i] as Scope).kind === 'fn') {
      return stack
        .slice(0, i + 1)
        .filter((s) => s.kind !== 'block')
        .map((s) => s.name)
        .join('.');
    }
  }
  return TOP_LEVEL;
}

function lineIndents(src: string): number[] {
  // indents[line] = columns of leading whitespace (tabs count as 8, like Python).
  const out = [0];
  for (const raw of src.split('\n')) {
    let col = 0;
    for (const ch of raw) {
      if (ch === ' ') col++;
      else if (ch === '\t') col = (Math.floor(col / 8) + 1) * 8;
      else break;
    }
    out.push(col);
  }
  return out;
}

function scopePython(tokens: Token[], src: string): Scoped {
  const indents = lineIndents(src);
  const owners: string[] = [];
  const functions: Scoped['functions'] = [];
  const stack: Scope[] = [];
  let depth = 0;
  let lastLine = 0;
  tokens.forEach((t, i) => {
    const logicalStart = depth === 0 && t.line !== lastLine && t.kind !== 'comment';
    if (t.kind !== 'comment') lastLine = t.line;
    if (logicalStart) {
      const indent = indents[t.line] ?? 0;
      while (stack.length && (stack[stack.length - 1] as Scope).indent >= indent) stack.pop();
      let k = i;
      if (t.text === 'async' && tokens[i + 1]?.text === 'def') k = i + 1;
      const head = tokens[k] as Token;
      const name = tokens[k + 1];
      if ((head.text === 'def' || head.text === 'class') && head.kind === 'keyword' && name?.kind === 'ident') {
        const kind = head.text === 'def' ? 'fn' : 'class';
        if (kind === 'fn') functions.push({ name: qualified(stack, name.text), line: t.line });
        stack.push({ kind, name: name.text, indent });
      }
    }
    if (t.kind === 'punct') {
      if (t.text === '(' || t.text === '[' || t.text === '{') depth++;
      else if (t.text === ')' || t.text === ']' || t.text === '}') depth = Math.max(0, depth - 1);
    }
    owners.push(currentOwner(stack));
  });
  return { owners, functions };
}

const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'sizeof', 'with']);
const CLASS_WORDS = new Set(['class', 'struct', 'interface', 'enum', 'namespace', 'union', 'record']);
/** Tokens that may sit between a parameter list's `)` and the body's `{`. */
const TRAILERS = new Set(['const', 'noexcept', 'override', 'final', 'throws', 'mutable', 'async']);

function scopeBraces(tokens: Token[]): Scoped {
  const owners: string[] = [];
  const functions: Scoped['functions'] = [];
  const stack: Scope[] = [];
  const sig = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'comment');
  const pos = new Map<number, number>();
  sig.forEach(({ i }, k) => pos.set(i, k));
  const at = (k: number): Token | undefined => sig[k]?.t;

  // Index (into sig) of the '(' matching the ')' at k, or -1.
  const matchOpen = (k: number): number => {
    let d = 0;
    for (let j = k; j >= 0; j--) {
      const x = (at(j) as Token).text;
      if (x === ')') d++;
      else if (x === '(') {
        d--;
        if (d === 0) return j;
      }
    }
    return -1;
  };

  // Name and header start for an arrow or anonymous function: `name = ...`, `name: ...`.
  const assignedName = (k: number): { name: string; start: number } | null => {
    const op = at(k);
    const id = at(k - 1);
    if (op && (op.text === '=' || op.text === ':') && id?.kind === 'ident') return { name: id.text, start: k - 1 };
    return null;
  };

  const classify = (k: number): { kind: Scope['kind']; name: string; start: number } => {
    // k is the sig index of '{'.
    let j = k - 1;
    const prev = at(j);
    if (!prev) return { kind: 'block', name: '', start: k };
    if (prev.text === '=>') {
      let p = j - 1;
      if (at(p)?.text === ')') p = matchOpen(p);
      if (p < 0) return { kind: 'fn', name: '<arrow>', start: k };
      p--;
      if (at(p)?.text === 'async') p--;
      const named = assignedName(p);
      return named ? { kind: 'fn', ...named } : { kind: 'fn', name: '<arrow>', start: p + 1 };
    }
    // class Foo extends Bar implements Baz {
    for (let back = 0; back < 12 && j - back >= 0; back++) {
      const x = at(j - back) as Token;
      if (x.text === ';' || x.text === '{' || x.text === '}' || x.text === ')' || x.text === '=') break;
      if (x.kind === 'keyword' && CLASS_WORDS.has(x.text)) {
        const name = at(j - back + 1);
        return { kind: 'class', name: name?.kind === 'ident' ? name.text : '<anonymous>', start: j - back };
      }
    }
    // Walk back over return types and trailers to the parameter list's ')'.
    for (let steps = 0; steps < 24 && j >= 0; steps++, j--) {
      const x = at(j) as Token;
      if (x.text === ')') break;
      const ok =
        x.kind === 'ident' ||
        TRAILERS.has(x.text) ||
        [':', ',', '<', '>', '[', ']', '->', '.', '::', '?', '|', '&', '*'].includes(x.text);
      if (!ok) return { kind: 'block', name: '', start: k };
    }
    if (at(j)?.text !== ')') return { kind: 'block', name: '', start: k };
    const open = matchOpen(j);
    if (open <= 0) return { kind: 'block', name: '', start: k };
    const before = at(open - 1) as Token;
    if (before.kind === 'ident' && !NOT_CALLS.has(before.text)) {
      // `new Foo() {` in Java is an anonymous class, not a method.
      if (at(open - 2)?.text === 'new') return { kind: 'class', name: before.text, start: open - 2 };
      return { kind: 'fn', name: before.text, start: open - 1 };
    }
    if (before.text === 'function') {
      const named = assignedName(open - 2);
      return named ? { kind: 'fn', ...named } : { kind: 'fn', name: '<anonymous>', start: open - 1 };
    }
    return { kind: 'block', name: '', start: k };
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.text === '{' && t.kind === 'punct') {
      const k = pos.get(i) as number;
      const c = classify(k);
      stack.push({ kind: c.kind, name: c.name, indent: 0 });
      if (c.kind === 'fn') {
        const owner = currentOwner(stack);
        const headerTok = (sig[c.start] as { t: Token; i: number }).i;
        functions.push({ name: owner, line: (tokens[headerTok] as Token).line });
        // The header (name and parameters) belongs to the function itself.
        for (let h = headerTok; h < i; h++) owners[h] = owner;
      }
      owners.push(currentOwner(stack));
      continue;
    }
    owners.push(currentOwner(stack));
    if (t.text === '}' && t.kind === 'punct') stack.pop();
  }
  return { owners, functions };
}

export function scope(tokens: Token[], src: string, lang: Lang): Scoped {
  return lang === 'python' ? scopePython(tokens, src) : scopeBraces(tokens);
}

const DECISION_WORDS: Record<Lang, Set<string>> = {
  python: new Set(['if', 'elif', 'for', 'while', 'except', 'and', 'or', 'case']),
  javascript: new Set(['if', 'for', 'while', 'case', 'catch', '&&', '||', '?', '??']),
  java: new Set(['if', 'for', 'while', 'case', 'catch', '&&', '||', '?']),
  cpp: new Set(['if', 'for', 'while', 'case', 'catch', '&&', '||', '?']),
};

/** Whether a token adds a branch to the control-flow graph (McCabe complexity). */
export function isDecision(t: Token, lang: Lang): boolean {
  if (t.kind !== 'keyword' && t.kind !== 'op') return false;
  return DECISION_WORDS[lang].has(t.text);
}
