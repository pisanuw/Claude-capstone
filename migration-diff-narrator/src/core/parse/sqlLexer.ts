/**
 * Small string-aware helpers shared by the SQL parser.
 *
 * They exist because the naive versions (`sql.split(';')`, `body.split(',')`)
 * break on the first comma inside `DECIMAL(10, 2)` or the first semicolon
 * inside a string default. Everything here walks the text once, tracking quote
 * and parenthesis state.
 */

const QUOTE_PAIRS: Record<string, string> = {
  "'": "'",
  '"': '"',
  '`': '`',
  '[': ']',
};

/** Replaces `--` and slash-star comments with spaces, preserving offsets. */
export function stripComments(sql: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];

    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = QUOTE_PAIRS[ch];
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        out += sql[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** Splits on top-level semicolons, ignoring those inside quotes or parens. */
export function splitStatements(sql: string): string[] {
  return splitOn(sql, ';').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Splits on a delimiter that appears at parenthesis depth zero, outside quotes. */
export function splitOn(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = QUOTE_PAIRS[ch];
      current += ch;
      continue;
    }

    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  parts.push(current);
  return parts;
}

/**
 * Returns the contents of the outermost parenthesised group, or null when the
 * text has no balanced group.
 */
export function outerParens(text: string): string | null {
  const start = text.indexOf('(');
  if (start === -1) return null;

  let depth = 0;
  let quote: string | null = null;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = QUOTE_PAIRS[ch];
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }

  return null;
}

/**
 * Reads a leading (possibly quoted, possibly schema-qualified) identifier off
 * the front of `text`, stopping at the first unquoted whitespace or `(`. This
 * is what lets `public."User Account" (...)` keep the space inside the quotes.
 */
export function readIdentToken(text: string): string {
  let i = 0;
  let quote: string | null = null;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      quote = QUOTE_PAIRS[ch];
      out += ch;
      i += 1;
      continue;
    }
    if (/\s/.test(ch) || ch === '(') break;
    out += ch;
    i += 1;
  }
  return out;
}

/** Strips identifier quoting and any schema qualifier: `public."Users"` -> `Users`. */
export function unquoteIdent(raw: string): string {
  const trimmed = raw.trim();
  const parts = splitOn(trimmed, '.');
  const last = (parts[parts.length - 1] ?? trimmed).trim();
  if (last.length >= 2) {
    const first = last[0];
    const final = last[last.length - 1];
    if ((first === '"' && final === '"') || (first === '`' && final === '`')) {
      return last.slice(1, -1);
    }
    if (first === '[' && final === ']') return last.slice(1, -1);
  }
  return last;
}

/** Parses a comma-separated identifier list, e.g. `(a, "b" DESC)` contents. */
export function identList(inner: string): string[] {
  return splitOn(inner, ',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => unquoteIdent(p.replace(/\s+(ASC|DESC)$/i, '').trim()));
}
