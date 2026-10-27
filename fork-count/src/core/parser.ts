// Lexer and recursive-descent parser for the small C subset Fork Count runs:
// int/pid_t variables, one-dimensional int and char arrays (for pipe fds and
// read buffers), char * strings, if/else, for, while, do-while,
// break/continue/return, blocks, and expressions with calls (fork, wait,
// printf, pipe, read, ...). Everything
// else (#include lines, `int main(void)`) is accepted and ignored so that
// textbook snippets paste in unchanged.

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

type TokKind = 'num' | 'str' | 'char' | 'id' | 'op' | 'eof';
interface Tok {
  kind: TokKind;
  value: string;
  line: number;
}

const OPS = [
  '<<=', '>>=', '...',
  '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->', '<<', '>>',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~', '?', ':', ';', ',', '(', ')', '{', '}', '[', ']', '.',
];

export function unescape(raw: string, line: number): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as string;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = raw[++i];
    if (n === undefined) throw new ParseError('dangling backslash in string', line);
    const map: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'", '0': '\0', r: '\r' };
    const m = map[n];
    if (m === undefined) throw new ParseError(`unsupported escape \\${n}`, line);
    out += m;
  }
  return out;
}

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '#') {
      // Preprocessor line: skip to end of line.
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (src.startsWith('//', i)) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new ParseError('unterminated comment', line);
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end + 2;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^(0[xX][0-9a-fA-F]+|[0-9]+)[uUlL]*/.exec(src.slice(i)) as RegExpExecArray;
      toks.push({ kind: 'num', value: String(Number((m[1] as string).toLowerCase())), line });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      toks.push({ kind: 'id', value: m[0], line });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        if (src[j] === '\n') throw new ParseError('newline inside a string literal', line);
        j++;
      }
      if (j >= src.length) throw new ParseError('unterminated literal', line);
      const text = unescape(src.slice(i + 1, j), line);
      if (c === "'") {
        if (text.length !== 1) throw new ParseError('character literal must hold one character', line);
        toks.push({ kind: 'num', value: String(text.charCodeAt(0)), line });
      } else {
        // Adjacent string literals concatenate, as in C.
        const prev = toks[toks.length - 1];
        if (prev && prev.kind === 'str') prev.value += text;
        else toks.push({ kind: 'str', value: text, line });
      }
      i = j + 1;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ParseError(`unexpected character '${c}'`, line);
    toks.push({ kind: 'op', value: op, line });
    i += op.length;
  }
  toks.push({ kind: 'eof', value: '', line });
  return toks;
}

export type Expr =
  | { k: 'num'; v: number; line: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'var'; name: string; line: number }
  | { k: 'addr'; name: string; line: number }
  | { k: 'null'; line: number }
  | { k: 'index'; name: string; i: Expr; line: number }
  | { k: 'sizeof'; e: Expr; line: number }
  | { k: 'list'; items: Expr[]; line: number }
  | { k: 'unary'; op: string; e: Expr; line: number }
  | { k: 'binary'; op: string; a: Expr; b: Expr; line: number }
  | { k: 'logic'; op: '&&' | '||'; a: Expr; b: Expr; line: number }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr; line: number }
  | { k: 'assign'; op: string; name: string; index: Expr | null; e: Expr; line: number }
  | { k: 'incdec'; op: '++' | '--'; prefix: boolean; name: string; index: Expr | null; line: number }
  | { k: 'call'; name: string; args: Expr[]; line: number };

export interface VarDecl {
  name: string;
  init: Expr | null;
  /** Declared as an array: `int fd[2]`, `char buf[64]`, `char msg[] = "hi"`. */
  array: boolean;
  /** Array length, or null when it comes from the initialiser. */
  size: Expr | null;
  /** A char array (a byte buffer), as opposed to `char *` or int. */
  char: boolean;
  /** `char *`: holds a string (or NULL). */
  ptr: boolean;
}

export type Stmt =
  | { k: 'expr'; e: Expr; line: number }
  | { k: 'decl'; vars: VarDecl[]; line: number }
  | { k: 'if'; c: Expr; then: Stmt; else: Stmt | null; line: number }
  | { k: 'while'; c: Expr; body: Stmt; line: number }
  | { k: 'do'; c: Expr; body: Stmt; line: number }
  | { k: 'for'; init: Stmt | null; c: Expr | null; step: Expr | null; body: Stmt; line: number }
  | { k: 'block'; body: Stmt[]; line: number }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'return'; e: Expr | null; line: number };

export interface Program {
  body: Stmt[];
}

const TYPE_WORDS = new Set([
  'int', 'pid_t', 'long', 'short', 'unsigned', 'signed', 'char', 'const', 'static', 'volatile', 'register', 'size_t',
  'ssize_t',
]);

const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/=', '%='];

/** sizeof for a type name: pointers are 8 bytes, char 1, long and size_t 8, the rest 4. */
function sizeOfType(words: string[], pointer: boolean): number {
  if (pointer) return 8;
  if (words.includes('char')) return 1;
  if (words.includes('long') || words.includes('size_t') || words.includes('ssize_t')) return 8;
  return 4;
}

class Parser {
  private p = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(o = 0): Tok {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)] as Tok;
  }
  private next(): Tok {
    const t = this.peek();
    if (t.kind !== 'eof') this.p++;
    return t;
  }
  private isOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.kind === 'op' && t.value === v;
  }
  private isId(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.kind === 'id' && t.value === v;
  }
  private expectOp(v: string): Tok {
    const t = this.next();
    if (t.kind !== 'op' || t.value !== v) {
      throw new ParseError(`expected '${v}' but found ${t.kind === 'eof' ? 'end of input' : `'${t.value}'`}`, t.line);
    }
    return t;
  }
  private ident(): Tok {
    const t = this.next();
    if (t.kind !== 'id') throw new ParseError(`expected a name but found '${t.value}'`, t.line);
    return t;
  }

  program(): Program {
    const body: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      // `int main(...) { ... }` and `void main()`: unwrap the body.
      if (this.atMain()) {
        while (!this.isOp('(')) this.next();
        this.skipParens();
        const block = this.statement();
        body.push(block);
        continue;
      }
      if (this.atFunctionDefinition()) {
        throw new ParseError('only main() is supported; inline helper functions into main', this.peek().line);
      }
      body.push(this.statement());
    }
    return { body };
  }

  private atMain(): boolean {
    let o = 0;
    while (this.peek(o).kind === 'id' && (TYPE_WORDS.has(this.peek(o).value) || this.peek(o).value === 'void')) o++;
    return this.isId('main', o) && this.isOp('(', o + 1);
  }

  private atFunctionDefinition(): boolean {
    let o = 0;
    let typed = false;
    while (this.peek(o).kind === 'id' && (TYPE_WORDS.has(this.peek(o).value) || this.peek(o).value === 'void')) {
      o++;
      typed = true;
    }
    return typed && this.peek(o).kind === 'id' && this.isOp('(', o + 1);
  }

  private skipParens(): void {
    let depth = 0;
    do {
      const t = this.next();
      if (t.kind === 'eof') throw new ParseError('unbalanced parentheses', t.line);
      if (t.value === '(') depth++;
      if (t.value === ')') depth--;
    } while (depth > 0);
  }

  private atType(): boolean {
    const t = this.peek();
    return t.kind === 'id' && TYPE_WORDS.has(t.value);
  }

  private declaration(): Stmt {
    const line = this.peek().line;
    let isChar = false;
    while (this.atType()) if (this.next().value === 'char') isChar = true;
    const vars: VarDecl[] = [];
    do {
      let pointer = false;
      while (this.isOp('*')) {
        this.next();
        pointer = true;
      }
      if (pointer && !isChar) throw new ParseError('only char * pointers (strings) are supported', this.peek().line);
      const name = this.ident().value;
      let array = false;
      let size: Expr | null = null;
      if (this.isOp('[')) {
        this.next();
        array = true;
        if (!this.isOp(']')) size = this.expression();
        this.expectOp(']');
        if (this.isOp('[')) throw new ParseError('multi-dimensional arrays are not supported', this.peek().line);
      }
      let init: Expr | null = null;
      if (this.isOp('=')) {
        this.next();
        init = this.isOp('{') ? this.initList() : this.assignment();
      }
      if (array && size === null && init === null) throw new ParseError(`array '${name}' needs a size`, line);
      vars.push({ name, init, array, size, char: isChar && !pointer, ptr: pointer });
    } while (this.isOp(',') && this.next());
    this.expectOp(';');
    return { k: 'decl', vars, line };
  }

  private initList(): Expr {
    const line = this.expectOp('{').line;
    const items: Expr[] = [];
    while (!this.isOp('}')) {
      items.push(this.assignment());
      if (!this.isOp(',')) break;
      this.next();
    }
    this.expectOp('}');
    return { k: 'list', items, line };
  }

  statement(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.kind === 'op' && t.value === '{') {
      this.next();
      const body: Stmt[] = [];
      while (!this.isOp('}')) {
        if (this.peek().kind === 'eof') throw new ParseError("missing '}'", line);
        body.push(this.statement());
      }
      this.next();
      return { k: 'block', body, line };
    }
    if (t.kind === 'op' && t.value === ';') {
      this.next();
      return { k: 'block', body: [], line };
    }
    if (this.atType()) return this.declaration();
    if (t.kind === 'id') {
      switch (t.value) {
        case 'if': {
          this.next();
          this.expectOp('(');
          const c = this.expression();
          this.expectOp(')');
          const then = this.statement();
          let els: Stmt | null = null;
          if (this.isId('else')) {
            this.next();
            els = this.statement();
          }
          return { k: 'if', c, then, else: els, line };
        }
        case 'while': {
          this.next();
          this.expectOp('(');
          const c = this.expression();
          this.expectOp(')');
          return { k: 'while', c, body: this.statement(), line };
        }
        case 'do': {
          this.next();
          const body = this.statement();
          if (!this.isId('while')) throw new ParseError("expected 'while' after do body", this.peek().line);
          this.next();
          this.expectOp('(');
          const c = this.expression();
          this.expectOp(')');
          this.expectOp(';');
          return { k: 'do', c, body, line };
        }
        case 'for': {
          this.next();
          this.expectOp('(');
          let init: Stmt | null = null;
          if (this.atType()) init = this.declaration();
          else if (this.isOp(';')) this.next();
          else {
            init = { k: 'expr', e: this.expression(), line };
            this.expectOp(';');
          }
          const c = this.isOp(';') ? null : this.expression();
          this.expectOp(';');
          const step = this.isOp(')') ? null : this.expression();
          this.expectOp(')');
          return { k: 'for', init, c, step, body: this.statement(), line };
        }
        case 'break':
          this.next();
          this.expectOp(';');
          return { k: 'break', line };
        case 'continue':
          this.next();
          this.expectOp(';');
          return { k: 'continue', line };
        case 'return': {
          this.next();
          const e = this.isOp(';') ? null : this.expression();
          this.expectOp(';');
          return { k: 'return', e, line };
        }
        case 'switch':
        case 'goto':
          throw new ParseError(`'${t.value}' is not supported`, line);
      }
    }
    const e = this.expression();
    this.expectOp(';');
    return { k: 'expr', e, line };
  }

  expression(): Expr {
    let e = this.assignment();
    while (this.isOp(',')) {
      const line = this.next().line;
      // Comma operator: evaluate both, keep the right. Modelled as a binary op.
      e = { k: 'binary', op: ',', a: e, b: this.assignment(), line };
    }
    return e;
  }

  private assignment(): Expr {
    const lhs = this.conditional();
    const t = this.peek();
    if (t.kind === 'op' && ASSIGN_OPS.includes(t.value)) {
      if (lhs.k !== 'var' && lhs.k !== 'index') throw new ParseError('can only assign to a variable or an array element', t.line);
      this.next();
      const index = lhs.k === 'index' ? lhs.i : null;
      return { k: 'assign', op: t.value, name: lhs.name, index, e: this.assignment(), line: lhs.line };
    }
    return lhs;
  }

  private conditional(): Expr {
    const c = this.logicOr();
    if (this.isOp('?')) {
      const line = this.next().line;
      const a = this.expression();
      this.expectOp(':');
      const b = this.conditional();
      return { k: 'cond', c, a, b, line };
    }
    return c;
  }

  private logicOr(): Expr {
    let e = this.logicAnd();
    while (this.isOp('||')) {
      const line = this.next().line;
      e = { k: 'logic', op: '||', a: e, b: this.logicAnd(), line };
    }
    return e;
  }

  private logicAnd(): Expr {
    let e = this.binary(0);
    while (this.isOp('&&')) {
      const line = this.next().line;
      e = { k: 'logic', op: '&&', a: e, b: this.binary(0), line };
    }
    return e;
  }

  private static readonly LEVELS = [['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

  private binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let e = this.binary(level + 1);
    const ops = Parser.LEVELS[level] as string[];
    while (this.peek().kind === 'op' && ops.includes(this.peek().value)) {
      const t = this.next();
      e = { k: 'binary', op: t.value, a: e, b: this.binary(level + 1), line: t.line };
    }
    return e;
  }

  private unary(): Expr {
    const t = this.peek();
    if (t.kind === 'op') {
      if (t.value === '!' || t.value === '-' || t.value === '+' || t.value === '~') {
        this.next();
        return { k: 'unary', op: t.value, e: this.unary(), line: t.line };
      }
      if (t.value === '++' || t.value === '--') {
        this.next();
        const name = this.ident().value;
        return { k: 'incdec', op: t.value, prefix: true, name, index: this.subscript(), line: t.line };
      }
      if (t.value === '&') {
        this.next();
        return { k: 'addr', name: this.ident().value, line: t.line };
      }
      if (t.value === '(' && this.peek(1).kind === 'id' && TYPE_WORDS.has(this.peek(1).value)) {
        // A cast such as (void) or (int): skip the type.
        this.next();
        while (this.atType() || this.isId('void')) this.next();
        // (char *) NULL, the usual execlp terminator: the cast changes nothing here.
        while (this.isOp('*')) this.next();
        this.expectOp(')');
        return this.unary();
      }
      if (t.value === '(' && this.isId('void', 1) && this.isOp('*', 2)) {
        this.next();
        this.next();
        while (this.isOp('*')) this.next();
        this.expectOp(')');
        return this.unary();
      }
      if (t.value === '(' && this.isId('void', 1) && this.isOp(')', 2)) {
        this.next();
        this.next();
        this.next();
        return this.unary();
      }
    }
    if (this.isId('sizeof')) {
      this.next();
      if (this.isOp('(') && this.peek(1).kind === 'id' && (TYPE_WORDS.has(this.peek(1).value) || this.isId('void', 1))) {
        this.next();
        const words: string[] = [];
        while (this.atType() || this.isId('void')) words.push(this.next().value);
        let pointer = false;
        while (this.isOp('*')) {
          this.next();
          pointer = true;
        }
        this.expectOp(')');
        return { k: 'num', v: sizeOfType(words, pointer), line: t.line };
      }
      return { k: 'sizeof', e: this.unary(), line: t.line };
    }
    return this.postfix();
  }

  /** An optional `[expr]` after a name. */
  private subscript(): Expr | null {
    if (!this.isOp('[')) return null;
    this.next();
    const i = this.expression();
    this.expectOp(']');
    if (this.isOp('[')) throw new ParseError('multi-dimensional arrays are not supported', this.peek().line);
    return i;
  }

  private postfix(): Expr {
    let e = this.primary();
    if (e.k === 'var') {
      const i = this.subscript();
      if (i) e = { k: 'index', name: e.name, i, line: e.line };
    }
    if ((e.k === 'var' || e.k === 'index') && (this.isOp('++') || this.isOp('--'))) {
      const op = this.next().value as '++' | '--';
      return { k: 'incdec', op, prefix: false, name: e.name, index: e.k === 'index' ? e.i : null, line: e.line };
    }
    return e;
  }

  private primary(): Expr {
    const t = this.next();
    if (t.kind === 'num') return { k: 'num', v: Number(t.value), line: t.line };
    if (t.kind === 'str') return { k: 'str', v: t.value, line: t.line };
    if (t.kind === 'id') {
      if (t.value === 'NULL') return { k: 'null', line: t.line };
      if (this.isOp('(')) {
        this.next();
        const args: Expr[] = [];
        if (!this.isOp(')')) {
          do args.push(this.assignment());
          while (this.isOp(',') && this.next());
        }
        this.expectOp(')');
        return { k: 'call', name: t.value, args, line: t.line };
      }
      return { k: 'var', name: t.value, line: t.line };
    }
    if (t.kind === 'op' && t.value === '(') {
      const e = this.expression();
      this.expectOp(')');
      return e;
    }
    throw new ParseError(t.kind === 'eof' ? 'unexpected end of input' : `unexpected '${t.value}'`, t.line);
  }
}

export function parse(src: string): Program {
  return new Parser(lex(src)).program();
}
