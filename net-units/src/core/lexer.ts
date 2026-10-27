/**
 * A small multi-language lexer. It does not build a syntax tree; it splits
 * source into tokens precisely enough to count syntax elements, which is all
 * the coding-unit measure needs. Supported: Python, JavaScript/TypeScript,
 * Java and C/C++.
 */

export type Lang = 'python' | 'javascript' | 'java' | 'cpp';

export type TokenKind = 'keyword' | 'ident' | 'number' | 'string' | 'op' | 'punct' | 'comment';

export interface Token {
  kind: TokenKind;
  text: string;
  /** 1-based line of the first character. */
  line: number;
  /** Character offsets into the source, end exclusive. */
  start: number;
  end: number;
}

export const LANG_NAMES: Record<Lang, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
};

const EXT: Record<string, Lang> = {
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  java: 'java',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
};

/** Language from a file name, or null for files the tool does not measure. */
export function detectLang(path: string): Lang | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? (EXT[(m[1] as string).toLowerCase()] ?? null) : null;
}

const KEYWORDS: Record<Lang, Set<string>> = {
  python: new Set(
    'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(
      ' ',
    ),
  ),
  javascript: new Set(
    'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null undefined true false interface type enum implements private public protected readonly'.split(
      ' ',
    ),
  ),
  java: new Set(
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record yield null true false'.split(
      ' ',
    ),
  ),
  cpp: new Set(
    'alignas alignof auto bool break case catch char class const constexpr continue decltype default delete do double else enum explicit extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public return short signed sizeof static static_cast struct switch template this throw true try typedef typename union unsigned using virtual void volatile while dynamic_cast reinterpret_cast const_cast override final'.split(
      ' ',
    ),
  ),
};

export function isKeyword(lang: Lang, word: string): boolean {
  return KEYWORDS[lang].has(word);
}

/** Longest operators first so `>>=` wins over `>>` and `>`. */
const OPERATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '//=',
  '<<=',
  '>>=',
  '>>>',
  '<=>',
  '->*',
  '?.',
  '??=',
  '??',
  '=>',
  '->',
  '::',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '//',
  '<<',
  '>>',
  ':=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '!',
  '~',
  '&',
  '|',
  '^',
  '?',
  '@',
];

/** Punctuation is structure, not content: it is never counted as a unit. */
const PUNCT = new Set(['(', ')', '[', ']', '{', '}', ',', ';', ':', '.', '#', '\\']);

const isIdStart = (c: string): boolean => /[A-Za-z_$À-￿]/.test(c);
const isIdPart = (c: string): boolean => /[A-Za-z0-9_$À-￿]/.test(c);
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

export function tokenize(src: string, lang: Lang): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  const push = (kind: TokenKind, start: number, startLine: number): void => {
    out.push({ kind, text: src.slice(start, i), line: startLine, start, end: i });
  };
  const advanceTo = (j: number): void => {
    for (; i < j && i < n; i++) if (src[i] === '\n') line++;
  };

  while (i < n) {
    const c = src[i] as string;
    const start = i;
    const startLine = line;

    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }

    // Comments.
    if (lang === 'python' ? c === '#' : c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      push('comment', start, startLine);
      continue;
    }
    if (lang !== 'python' && c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      advanceTo(close < 0 ? n : close + 2);
      push('comment', start, startLine);
      continue;
    }

    // Strings. Python allows prefixes such as f, r, b and rb before the quote.
    if (lang === 'python' && isIdStart(c)) {
      const m = /^(?:[rRbBuUfF]{1,2})(?=['"])/.exec(src.slice(i, i + 3));
      if (m) {
        i += m[0].length;
        lexString(src[i] as string);
        push('string', start, startLine);
        continue;
      }
    }
    if (c === '"' || c === "'" || (c === '`' && lang === 'javascript')) {
      lexString(c);
      push('string', start, startLine);
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const m = /^(?:0[xX][0-9a-fA-F_']+|0[bB][01_']+|(?:\d[\d_']*)?\.?\d[\d_']*(?:[eE][+-]?\d+)?)[a-zA-Z]*/.exec(
        src.slice(i),
      );
      i += m ? Math.max(1, m[0].length) : 1;
      push('number', start, startLine);
      continue;
    }

    if (isIdStart(c)) {
      while (i < n && isIdPart(src[i] as string)) i++;
      push(isKeyword(lang, src.slice(start, i)) ? 'keyword' : 'ident', start, startLine);
      continue;
    }

    if (PUNCT.has(c) && !(c === ':' && src[i + 1] === ':') && !(c === '.' && src.startsWith('...', i))) {
      i++;
      push('punct', start, startLine);
      continue;
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      i += op.length;
      push('op', start, startLine);
      continue;
    }

    // Anything else (stray characters) is skipped rather than failing the file.
    i++;
  }
  return out;

  function lexString(q: string): void {
    const triple = lang === 'python' && src.startsWith(q.repeat(3), i);
    if (triple) {
      const close = src.indexOf(q.repeat(3), i + 3);
      advanceTo(close < 0 ? n : close + 3);
      return;
    }
    i++;
    while (i < n) {
      const ch = src[i] as string;
      if (ch === '\\') {
        advanceTo(i + 2);
        continue;
      }
      if (ch === q) {
        i++;
        return;
      }
      // Only template literals may span lines; an unclosed quote ends at the newline.
      if (ch === '\n' && q !== '`') return;
      if (ch === '\n') line++;
      i++;
    }
  }
}

/**
 * A coding unit is any token that carries meaning: names, keywords,
 * literals and operators. Punctuation and comments do not count, and neither
 * does layout, so squeezing code onto fewer lines does not change the total.
 */
export function isUnit(t: Token): boolean {
  return t.kind !== 'punct' && t.kind !== 'comment';
}

export function countUnits(src: string, lang: Lang): number {
  return tokenize(src, lang).filter(isUnit).length;
}
