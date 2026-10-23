// A tiny, safe arithmetic parser for the target box: numbers, + - * / ^,
// parentheses, and one top-level ':' meaning "a to b" (a / b). No eval.

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): number {
    const left = this.sum();
    this.skip();
    if (this.peek() === ':') {
      this.pos++;
      const right = this.sum();
      this.end();
      if (right === 0) throw new Error('Ratio denominator is zero');
      return left / right;
    }
    this.end();
    return left;
  }

  private end(): void {
    this.skip();
    if (this.pos < this.src.length) throw new Error(`Unexpected '${this.src[this.pos]}' at ${this.pos + 1}`);
  }

  private skip(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos] as string)) this.pos++;
  }

  private peek(): string | undefined {
    this.skip();
    return this.src[this.pos];
  }

  private sum(): number {
    let v = this.product();
    for (;;) {
      const c = this.peek();
      if (c === '+') {
        this.pos++;
        v += this.product();
      } else if (c === '-') {
        this.pos++;
        v -= this.product();
      } else return v;
    }
  }

  private product(): number {
    let v = this.power();
    for (;;) {
      const c = this.peek();
      if (c === '*' || c === '×') {
        this.pos++;
        v *= this.power();
      } else if (c === '/' || c === '÷') {
        this.pos++;
        const d = this.power();
        if (d === 0) throw new Error('Division by zero');
        v /= d;
      } else return v;
    }
  }

  private power(): number {
    const base = this.unary();
    if (this.peek() === '^') {
      this.pos++;
      return base ** this.power();
    }
    return base;
  }

  private unary(): number {
    const c = this.peek();
    if (c === '-') {
      this.pos++;
      return -this.unary();
    }
    if (c === '+') {
      this.pos++;
      return this.unary();
    }
    return this.atom();
  }

  private atom(): number {
    const c = this.peek();
    if (c === '(') {
      this.pos++;
      const v = this.sum();
      if (this.peek() !== ')') throw new Error('Missing )');
      this.pos++;
      return v;
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(this.src.slice(this.pos));
    if (!m) throw new Error(c === undefined ? 'Unexpected end of input' : `Unexpected '${c}' at ${this.pos + 1}`);
    this.pos += m[0].length;
    return Number(m[0]);
  }
}

export function parseExpression(src: string): ParseResult {
  if (!src.trim()) return { ok: false, error: 'Enter a ratio such as 12, 1440 or 365.2422/366.2422' };
  try {
    const value = new Parser(src).parse();
    if (!Number.isFinite(value)) return { ok: false, error: 'The value is not finite' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
