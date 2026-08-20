import type { SchemaModel, Entity, TypeFamily } from '../types.js';
import { emptyModel, makeEntity, makeColumn } from '../types.js';

/**
 * Parses TypeScript `interface X { ... }` and `type X = { ... }` declarations
 * into the IR. This is a deliberate subset: object-literal shapes with
 * optional/readonly members and union types. Methods, generics, mapped types
 * and everything else are skipped with a warning rather than half-parsed.
 */
export function parseTypescript(input: string): SchemaModel {
  const model = emptyModel('typescript');
  const clean = stripTsComments(input);

  const declRe =
    /(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)\s*(<[^>{=]*>)?\s*(extends\s+[^{]+)?(=\s*)?/g;

  let match: RegExpExecArray | null;
  while ((match = declRe.exec(clean)) !== null) {
    const [, keyword, name, generics, extendsClause] = match;
    const afterHead = clean.slice(declRe.lastIndex);

    if (keyword === 'type' && !/^\s*\{/.test(afterHead)) {
      // `type X = string | Y` — an alias, not an object shape.
      model.warnings.push(`Type alias ${name} is not an object shape and was skipped.`);
      continue;
    }

    const braceStart = afterHead.indexOf('{');
    if (braceStart === -1) continue;
    const body = readBraces(afterHead, braceStart);
    if (body === null) {
      model.warnings.push(`Could not find the closing brace of ${name}; it was skipped.`);
      continue;
    }
    declRe.lastIndex += braceStart + body.length + 2;

    const entity = makeEntity(name);
    if (generics) model.warnings.push(`${name} is generic; type parameters are compared as written.`);
    parseMembers(body, entity, model);

    if (extendsClause) {
      const parents = extendsClause.replace(/^extends\s+/, '').split(',').map((p) => p.trim());
      for (const parent of parents) {
        const parentEntity = model.entities.find((e) => e.name === parent.replace(/<.*$/, ''));
        if (parentEntity) {
          // Inherit parent members the child does not override.
          const own = new Set(entity.columns.map((c) => c.name));
          for (const col of parentEntity.columns) {
            if (!own.has(col.name)) {
              entity.columns.push({ ...col, position: entity.columns.length });
            }
          }
        } else {
          model.warnings.push(`${name} extends ${parent}, which is not declared in this input.`);
        }
      }
    }

    model.entities.push(entity);
  }

  return model;
}

/** Replaces // and /* comments with spaces, respecting string literals. */
export function stripTsComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
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

/** Returns the contents between the brace at `start` and its match, or null. */
function readBraces(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

function parseMembers(body: string, entity: Entity, model: SchemaModel): void {
  for (const raw of splitMembers(body)) {
    const member = raw.trim();
    if (member.length === 0) continue;

    // Methods and index signatures are not data columns.
    if (/^\[/.test(member)) {
      model.warnings.push(`${entity.name} has an index signature; it was skipped.`);
      continue;
    }
    const m = member.match(/^(readonly\s+)?([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*(\?)?\s*:\s*(.+)$/s);
    if (!m) {
      if (/\(/.test(member)) {
        model.warnings.push(`${entity.name}.${member.split(/[(\s]/)[0]} looks like a method; it was skipped.`);
      }
      continue;
    }

    const [, ro, rawName, optional, rawTypeText] = m;
    const name = rawName.replace(/^['"]|['"]$/g, '');
    const typeText = rawTypeText.trim();

    const { core, nullable } = splitNullability(typeText);
    const family = tsFamily(core);
    const column = makeColumn(name, typeText, family, entity.columns.length);
    column.nullable = Boolean(optional) || nullable;
    column.readonly = Boolean(ro);
    if (family === 'enum') {
      column.members = core.split('|').map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
    }
    entity.columns.push(column);
  }
}

/** Splits interface members on `;`, `,` and newlines at brace/angle depth 0. */
function splitMembers(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '<' || ch === '[') depth += 1;
    if (ch === '}' || ch === ')' || ch === '>' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ';' || ch === ',' || ch === '\n') && depth === 0) {
      // A newline only terminates a member if it already looks complete
      // (has a `:`), so multi-line union types keep accumulating.
      if (ch === '\n' && !/:\s*\S/.test(current)) {
        current += ch;
        continue;
      }
      if (ch === '\n' && /[|&:]\s*$/.test(current.trim())) {
        current += ch;
        continue;
      }
      // A union can also break with the `|` leading the next line.
      if (ch === '\n' && /^\s*[|&]/.test(body.slice(i + 1))) {
        current += ch;
        continue;
      }
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Removes `null` / `undefined` union members; reports whether any were present. */
export function splitNullability(typeText: string): { core: string; nullable: boolean } {
  const members = splitUnion(typeText);
  const kept = members.filter((p) => p !== 'null' && p !== 'undefined');
  const nullable = kept.length !== members.length;
  return { core: kept.join(' | ') || typeText.trim(), nullable };
}

/** Splits a union type on `|` at depth 0. */
function splitUnion(typeText: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < typeText.length; i += 1) {
    const ch = typeText[i];
    if (ch === '{' || ch === '(' || ch === '<' || ch === '[') depth += 1;
    if (ch === '}' || ch === ')' || ch === '>' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === '|' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts.filter((p) => p.length > 0);
}

/** Maps a TypeScript type expression (already nullability-stripped) to a family. */
export function tsFamily(core: string): TypeFamily {
  const t = core.trim();
  const members = splitUnion(t);
  if (members.length > 1) {
    if (members.every((m) => /^['"].*['"]$/.test(m))) return 'enum';
    return 'unknown';
  }
  if (/^['"].*['"]$/.test(t) || /^-?\d+(\.\d+)?$/.test(t) || t === 'true' || t === 'false') return 'literal';
  if (/\[\]$/.test(t) || /^(Array|ReadonlyArray)</.test(t)) return 'array';
  switch (t) {
    case 'string':
      return 'string';
    case 'number':
      return 'float';
    case 'bigint':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'Date':
      return 'datetime';
    case 'object':
      return 'object';
  }
  if (/^\{/.test(t) || /^(Record|Map|Set|Partial|Pick|Omit)</.test(t)) return 'object';
  if (t === 'Buffer' || t === 'Uint8Array' || t === 'ArrayBuffer') return 'binary';
  return 'unknown';
}
