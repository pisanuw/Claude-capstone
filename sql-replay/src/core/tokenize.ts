import { SqlError } from './types';

export type TokenType = 'ident' | 'number' | 'string' | 'op' | 'punct' | 'eof';

export interface Token {
  type: TokenType;
  /** Identifiers and keywords are lowercased here; `raw` keeps the original. */
  text: string;
  raw: string;
  pos: number;
}

const OPS = ['<=', '>=', '<>', '!=', '=', '<', '>', '+', '-', '*', '/', '%'];
const PUNCT = ['(', ')', ',', '.'];

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      i++;
      let s = '';
      let closed = false;
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { s += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        s += sql[i]; i++;
      }
      if (!closed) throw new SqlError('Unterminated string literal', start);
      tokens.push({ type: 'string', text: s, raw: sql.slice(start, i), pos: start });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const start = i;
      while (i < n && /[0-9]/.test(sql[i])) i++;
      if (sql[i] === '.' && /[0-9]/.test(sql[i + 1] ?? '')) {
        i++;
        while (i < n && /[0-9]/.test(sql[i])) i++;
      }
      tokens.push({ type: 'number', text: sql.slice(start, i), raw: sql.slice(start, i), pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(sql[i])) i++;
      const raw = sql.slice(start, i);
      tokens.push({ type: 'ident', text: raw.toLowerCase(), raw, pos: start });
      continue;
    }
    const two = sql.slice(i, i + 2);
    const op = OPS.find((o) => (o.length === 2 ? o === two : o === c));
    if (op) {
      tokens.push({ type: 'op', text: op === '<>' ? '!=' : op, raw: op, pos: i });
      i += op.length;
      continue;
    }
    if (PUNCT.includes(c)) {
      tokens.push({ type: 'punct', text: c, raw: c, pos: i });
      i++;
      continue;
    }
    if (c === ';') { i++; continue; }
    throw new SqlError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ type: 'eof', text: '', raw: '', pos: n });
  return tokens;
}
