// Lexer and recursive-descent parser for the C subset Cache Miss Theater
// traces: array and scalar declarations, #define constants, for/while loops,
// if/else, blocks, and C expressions (no pointers or calls other than
// min/max/abs). A function wrapper such as `void kernel(void) { ... }` is
// accepted and its body is run, so textbook loop nests paste in unchanged.

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

type TokKind = 'num' | 'id' | 'op' | 'define' | 'eof';
interface Tok {
  kind: TokKind;
  value: string;
  line: number;
}

const OPS = [
  '<<=', '>>=',
  '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~', '?', ':', ';', ',', '(', ')', '{', '}', '[', ']', '@',
];

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
      // `#define NAME value` becomes a define token followed by the value
      // tokens and a ';'. Other preprocessor lines (#include) are skipped.
      let end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      const text = src.slice(i, end);
      const m = /^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/.exec(text.replace(/\/\/.*$/, '').trim());
      if (m) {
        toks.push({ kind: 'define', value: m[1] as string, line });
        for (const t of lex(m[2] as string)) if (t.kind !== 'eof') toks.push({ ...t, line });
        toks.push({ kind: 'op', value: ';', line });
      } else if (/^#\s*define\b/.test(text)) {
        throw new ParseError('#define needs a name and a value', line);
      }
      i = end;
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
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)[uUlLfF]*/.exec(src.slice(i)) as RegExpExecArray;
      toks.push({ kind: 'num', value: String(Number((m[1] as string).toLowerCase())), line });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i)) as RegExpExecArray;
      toks.push({ kind: 'id', value: m[0], line });
      i += m[0].length;
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
  | { k: 'var'; name: string; line: number }
  | { k: 'index'; name: string; idx: Expr[]; line: number }
  | { k: 'unary'; op: string; e: Expr; line: number }
  | { k: 'binary'; op: string; l: Expr; r: Expr; line: number }
  | { k: 'cond'; c: Expr; t: Expr; f: Expr; line: number }
  | { k: 'assign'; op: string; target: Expr; e: Expr; line: number }
  | { k: 'incdec'; op: '++' | '--'; prefix: boolean; target: Expr; line: number }
  | { k: 'call'; name: string; args: Expr[]; line: number };

export interface Declarator {
  name: string;
  dims: Expr[];
  at: Expr | null;
  init: Expr | null;
  line: number;
}

export type Stmt =
  | { k: 'decl'; type: string; elemSize: number; vars: Declarator[]; line: number }
  | { k: 'define'; name: string; e: Expr; line: number }
  | { k: 'expr'; e: Expr; line: number }
  | { k: 'block'; body: Stmt[]; line: number }
  | { k: 'for'; init: Stmt | null; cond: Expr | null; step: Expr | null; body: Stmt; line: number }
  | { k: 'while'; cond: Expr; body: Stmt; line: number }
  | { k: 'if'; cond: Expr; then: Stmt; else: Stmt | null; line: number }
  | { k: 'empty'; line: number };

/** Element sizes in bytes for the scalar types the subset understands. */
export const TYPE_SIZES: Record<string, number> = {
  char: 1,
  int8_t: 1,
  uint8_t: 1,
  short: 2,
  int16_t: 2,
  uint16_t: 2,
  int: 4,
  float: 4,
  int32_t: 4,
  uint32_t: 4,
  long: 8,
  double: 8,
  int64_t: 8,
  uint64_t: 8,
  size_t: 8,
};

const QUALIFIERS = new Set(['const', 'static', 'unsigned', 'signed', 'register', 'volatile', 'restrict']);
const CALLS = new Set(['min', 'max', 'MIN', 'MAX', 'abs']);

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
  private is(v: string, o = 0): boolean {
    const t = this.peek(o);
    return (t.kind === 'op' || t.kind === 'id') && t.value === v;
  }
  private eat(v: string): boolean {
    if (this.is(v)) {
      this.p++;
      return true;
    }
    return false;
  }
  private expect(v: string): Tok {
    const t = this.peek();
    if (!this.is(v)) throw new ParseError(`expected '${v}' but found ${t.kind === 'eof' ? 'end of input' : `'${t.value}'`}`, t.line);
    return this.next();
  }
  private ident(): Tok {
    const t = this.peek();
    if (t.kind !== 'id') throw new ParseError(`expected a name but found ${t.kind === 'eof' ? 'end of input' : `'${t.value}'`}`, t.line);
    return this.next();
  }

  /** Length of a type prefix at the cursor (0 if none), and its element size. */
  private typeAt(): { len: number; size: number; name: string } {
    let o = 0;
    let size = 0;
    const words: string[] = [];
    let sawUnsigned = false;
    while (this.peek(o).kind === 'id') {
      const w = this.peek(o).value;
      if (QUALIFIERS.has(w)) {
        if (w === 'unsigned' || w === 'signed') sawUnsigned = true;
        words.push(w);
        o++;
        continue;
      }
      const s = TYPE_SIZES[w];
      if (s === undefined) break;
      // `long long`, `long int`, `short int`: keep the widest named size.
      if (w === 'int' && size) {
        words.push(w);
        o++;
        continue;
      }
      size = Math.max(size, s);
      words.push(w);
      o++;
    }
    if (!size && sawUnsigned) size = 4; // bare `unsigned`
    if (!size) return { len: 0, size: 0, name: '' };
    if (this.is('void', o)) return { len: 0, size: 0, name: '' };
    return { len: o, size, name: words.filter((w) => !QUALIFIERS.has(w) || w === 'unsigned').join(' ') };
  }

  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      const fn = this.functionHeader();
      if (fn) {
        out.push(this.block());
        continue;
      }
      out.push(this.stmt());
    }
    return out;
  }

  /** Skips `type name(params)` before a `{` and returns true, else leaves the cursor. */
  private functionHeader(): boolean {
    const start = this.p;
    let o = 0;
    while (this.peek(o).kind === 'id' && (QUALIFIERS.has(this.peek(o).value) || TYPE_SIZES[this.peek(o).value] !== undefined || this.peek(o).value === 'void'))
      o++;
    if (o === 0 || this.peek(o).kind !== 'id' || !this.is('(', o + 1)) return false;
    this.p += o + 2;
    let depth = 1;
    while (depth > 0) {
      const t = this.next();
      if (t.kind === 'eof') {
        this.p = start;
        return false;
      }
      if (t.value === '(') depth++;
      if (t.value === ')') depth--;
    }
    if (!this.is('{')) {
      this.p = start;
      return false;
    }
    return true;
  }

  private block(): Stmt {
    const line = this.expect('{').line;
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.peek().kind === 'eof') throw new ParseError("missing '}'", line);
      body.push(this.stmt());
    }
    this.next();
    return { k: 'block', body, line };
  }

  private stmt(): Stmt {
    const t = this.peek();
    if (t.kind === 'define') {
      this.next();
      const e = this.expr();
      this.expect(';');
      return { k: 'define', name: t.value, e, line: t.line };
    }
    if (this.is('{')) return this.block();
    if (this.eat(';')) return { k: 'empty', line: t.line };
    if (this.eat('for')) {
      this.expect('(');
      let init: Stmt | null = null;
      if (!this.eat(';')) {
        init = this.typeAt().len ? this.decl() : { k: 'expr', e: this.expr(), line: t.line };
        if (init.k === 'expr') this.expect(';');
      }
      const cond = this.is(';') ? null : this.expr();
      this.expect(';');
      const step = this.is(')') ? null : this.expr();
      this.expect(')');
      return { k: 'for', init, cond, step, body: this.stmt(), line: t.line };
    }
    if (this.eat('while')) {
      this.expect('(');
      const cond = this.expr();
      this.expect(')');
      return { k: 'while', cond, body: this.stmt(), line: t.line };
    }
    if (this.eat('if')) {
      this.expect('(');
      const cond = this.expr();
      this.expect(')');
      const then = this.stmt();
      const els = this.eat('else') ? this.stmt() : null;
      return { k: 'if', cond, then, else: els, line: t.line };
    }
    if (this.is('return')) {
      this.next();
      if (!this.is(';')) this.expr();
      this.expect(';');
      return { k: 'empty', line: t.line };
    }
    for (const kw of ['do', 'switch', 'goto', 'break', 'continue', 'struct', 'typedef'])
      if (this.is(kw)) throw new ParseError(`'${kw}' is not supported; use for/while loops over arrays`, t.line);
    if (this.typeAt().len) return this.decl();
    const e = this.expr();
    this.expect(';');
    return { k: 'expr', e, line: t.line };
  }

  private decl(): Stmt {
    const line = this.peek().line;
    const ty = this.typeAt();
    this.p += ty.len;
    const vars: Declarator[] = [];
    do {
      if (this.is('*')) throw new ParseError('pointers are not supported; declare arrays with sizes', this.peek().line);
      const name = this.ident();
      const dims: Expr[] = [];
      while (this.eat('[')) {
        if (this.is(']')) throw new ParseError(`array '${name.value}' needs a size in every dimension`, name.line);
        dims.push(this.expr());
        this.expect(']');
      }
      const at = this.eat('@') ? this.unary() : null;
      if (at && !dims.length) throw new ParseError(`'@ address' only applies to arrays`, name.line);
      const init = this.eat('=') ? this.assign() : null;
      if (init && dims.length) throw new ParseError(`array initialisers are not supported ('${name.value}')`, name.line);
      vars.push({ name: name.value, dims, at, init, line: name.line });
    } while (this.eat(','));
    this.expect(';');
    return { k: 'decl', type: ty.name, elemSize: ty.size, vars, line };
  }

  expr(): Expr {
    let e = this.assign();
    while (this.is(',')) {
      const line = this.next().line;
      e = { k: 'binary', op: ',', l: e, r: this.assign(), line };
    }
    return e;
  }

  private assign(): Expr {
    const l = this.cond();
    const t = this.peek();
    if (t.kind === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(t.value)) {
      if (l.k !== 'var' && l.k !== 'index') throw new ParseError(`cannot assign to this expression`, t.line);
      this.next();
      return { k: 'assign', op: t.value, target: l, e: this.assign(), line: t.line };
    }
    return l;
  }

  private cond(): Expr {
    const c = this.bin(0);
    if (!this.is('?')) return c;
    const line = this.next().line;
    const t = this.expr();
    this.expect(':');
    return { k: 'cond', c, t, f: this.cond(), line };
  }

  private static readonly LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

  private bin(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let l = this.bin(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op' || !(Parser.LEVELS[level] as string[]).includes(t.value)) return l;
      this.next();
      l = { k: 'binary', op: t.value, l, r: this.bin(level + 1), line: t.line };
    }
  }

  private unary(): Expr {
    const t = this.peek();
    if (t.kind === 'op' && (t.value === '++' || t.value === '--')) {
      this.next();
      const target = this.unary();
      if (target.k !== 'var' && target.k !== 'index') throw new ParseError(`${t.value} needs a variable or array element`, t.line);
      return { k: 'incdec', op: t.value, prefix: true, target, line: t.line };
    }
    if (t.kind === 'op' && ['-', '+', '!', '~'].includes(t.value)) {
      this.next();
      return { k: 'unary', op: t.value, e: this.unary(), line: t.line };
    }
    if (t.kind === 'op' && t.value === '&') throw new ParseError('the address-of operator is not supported', t.line);
    if (t.kind === 'op' && t.value === '*') throw new ParseError('pointer dereference is not supported; index arrays instead', t.line);
    // Casts such as (double) or (int) are accepted and ignored.
    if (this.is('(')) {
      const save = this.p;
      this.next();
      const ty = this.typeAt();
      if (ty.len && this.is(')', ty.len)) {
        this.p += ty.len + 1;
        return this.unary();
      }
      this.p = save;
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.value === '++' || t.value === '--')) {
        if (e.k !== 'var' && e.k !== 'index') throw new ParseError(`${t.value} needs a variable or array element`, t.line);
        this.next();
        e = { k: 'incdec', op: t.value, prefix: false, target: e, line: t.line };
        continue;
      }
      return e;
    }
  }

  private primary(): Expr {
    const t = this.next();
    if (t.kind === 'num') return { k: 'num', v: Number(t.value), line: t.line };
    if (t.kind === 'op' && t.value === '(') {
      const e = this.expr();
      this.expect(')');
      return e;
    }
    if (t.kind === 'id') {
      if (this.is('(')) {
        if (!CALLS.has(t.value)) throw new ParseError(`function calls are not supported ('${t.value}'); only min, max and abs`, t.line);
        this.next();
        const args: Expr[] = [];
        if (!this.is(')')) {
          do args.push(this.assign());
          while (this.eat(','));
        }
        this.expect(')');
        const want = t.value === 'abs' ? 1 : 2;
        if (args.length !== want) throw new ParseError(`${t.value} takes ${want} argument${want > 1 ? 's' : ''}`, t.line);
        return { k: 'call', name: t.value.toLowerCase(), args, line: t.line };
      }
      if (this.is('[')) {
        const idx: Expr[] = [];
        while (this.eat('[')) {
          idx.push(this.expr());
          this.expect(']');
        }
        return { k: 'index', name: t.value, idx, line: t.line };
      }
      return { k: 'var', name: t.value, line: t.line };
    }
    throw new ParseError(t.kind === 'eof' ? 'unexpected end of input' : `unexpected '${t.value}'`, t.line);
  }
}

export function parse(src: string): Stmt[] {
  return new Parser(lex(src)).program();
}
