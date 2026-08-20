import type { Schema, Entity, Field, Relationship } from '../types.js';
import { emptySchema, makeField } from '../types.js';
import {
  stripComments,
  splitStatements,
  splitOn,
  outerParens,
  unquoteIdent,
  identList,
  readIdentToken,
} from './sqlLexer.js';
import { normalizeSqlType, MULTIWORD_TYPES } from './types.js';
import { finalizeSchema } from './finalize.js';

const CONSTRAINT_KEYWORDS = new Set([
  'primary',
  'foreign',
  'unique',
  'constraint',
  'check',
  'key',
  'index',
  'exclude',
  'like',
]);

/** Parses a subset of ANSI / PostgreSQL / MySQL `CREATE TABLE` DDL into the IR. */
export function parseSql(input: string): Schema {
  const schema = emptySchema('sql');
  const clean = stripComments(input);

  for (const statement of splitStatements(clean)) {
    const head = statement.replace(/^\s+/, '');
    if (/^create\s+(temp(orary)?\s+)?table/i.test(head)) {
      parseCreateTable(head, schema);
    } else if (/^create\s+(unique\s+)?index/i.test(head)) {
      parseCreateIndex(head, schema);
    } else if (/^alter\s+table/i.test(head)) {
      parseAlterTable(head, schema);
    }
    // Everything else (INSERT, CREATE VIEW, SET, comments-only) is ignored on
    // purpose: it does not shape the data model.
  }

  return finalizeSchema(schema);
}

function parseCreateTable(statement: string, schema: Schema): void {
  const prefixMatch = statement.match(/^create\s+(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?/i);
  if (!prefixMatch) return;
  const name = unquoteIdent(readIdentToken(statement.slice(prefixMatch[0].length)));

  const body = outerParens(statement);
  if (body === null) {
    // `CREATE TABLE x AS SELECT ...` or `CREATE TABLE x ();` — record the entity
    // so references resolve, but there are no columns to read.
    schema.entities.push(blankEntity(name));
    return;
  }

  const entity = blankEntity(name);
  for (const rawClause of splitOn(body, ',')) {
    const clause = rawClause.trim();
    if (clause.length === 0) continue;

    const firstWord = clause.split(/[\s(]/)[0].toLowerCase();
    if (CONSTRAINT_KEYWORDS.has(firstWord)) {
      applyTableConstraint(clause, entity, schema);
    } else {
      const field = parseColumn(clause, entity, schema);
      if (field) entity.fields.push(field);
    }
  }

  schema.entities.push(entity);
}

function blankEntity(name: string): Entity {
  return { name, fields: [], primaryKey: [], uniques: [] };
}

function parseColumn(clause: string, entity: Entity, schema: Schema): Field | null {
  const nameMatch = clause.match(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s*(.*)$/s);
  if (!nameMatch) return null;

  const name = unquoteIdent(nameMatch[1]);
  let rest = nameMatch[2].trim();

  // Pull off the type, which may be multi-word and may carry a `(len)` or
  // `(precision, scale)` tail we want to remember for varchar sizing.
  const { rawType, maxLength, remainder } = consumeType(rest);
  rest = remainder;

  const field = makeField(name, rawType, normalizeSqlType(baseTypeName(rawType)));
  if (maxLength !== undefined) field.maxLength = maxLength;

  const upper = ` ${rest.toUpperCase()} `;
  // Auto-increment can be spelled as the type itself (Postgres SERIAL) or as a
  // trailing keyword (MySQL AUTO_INCREMENT), so look at both.
  const typeAndRest = `${rawType.toUpperCase()} ${upper}`;
  if (/\bNOT\s+NULL\b/.test(upper)) field.nullable = false;
  if (/\bPRIMARY\s+KEY\b/.test(upper)) {
    field.isPrimaryKey = true;
    field.nullable = false;
    entity.primaryKey = [name];
  }
  if (/\bUNIQUE\b/.test(upper)) field.isUnique = true;
  if (/\bCHECK\b/.test(upper)) field.hasCheck = true;
  if (/\b(SERIAL|BIGSERIAL|SMALLSERIAL|AUTO_INCREMENT|IDENTITY|AUTOINCREMENT)\b/.test(typeAndRest)) {
    field.hasDefault = true;
  }

  const def = rest.match(/\bDEFAULT\s+(.+?)(?=\s+(?:NOT|NULL|PRIMARY|UNIQUE|CHECK|REFERENCES|COLLATE|GENERATED)\b|$)/is);
  if (def) {
    field.hasDefault = true;
    field.defaultValue = def[1].trim();
  }

  const inlineRef = rest.match(/\bREFERENCES\s+([^\s(]+)\s*(\(([^)]*)\))?/i);
  if (inlineRef) {
    const target = unquoteIdent(inlineRef[1]);
    const targetCols = inlineRef[3] ? identList(inlineRef[3]) : ['id'];
    field.references = { entity: target, field: targetCols[0] ?? 'id' };
    addRelationship(schema, {
      from: entity.name,
      fromFields: [name],
      to: target,
      toFields: targetCols,
      optional: field.nullable,
    });
  }

  return field;
}

/** Reads the type token(s) off the front of a column definition. */
function consumeType(text: string): { rawType: string; maxLength?: number; remainder: string } {
  const lower = text.toLowerCase();
  for (const mw of MULTIWORD_TYPES) {
    if (lower.startsWith(mw)) {
      let end = mw.length;
      let maxLength: number | undefined;
      // A length/precision tail can follow a multiword type: CHARACTER VARYING(40).
      const tail = text.slice(mw.length).match(/^\s*\(([^)]*)\)/);
      if (tail) {
        end += tail[0].length;
        const n = Number.parseInt(tail[1].split(',')[0].trim(), 10);
        if (Number.isFinite(n)) maxLength = n;
      }
      return { rawType: text.slice(0, end).trim(), maxLength, remainder: text.slice(end).trim() };
    }
  }

  const match = text.match(/^([A-Za-z_][\w]*)\s*(\(([^)]*)\))?/);
  if (!match) return { rawType: text, remainder: '' };

  const rawType = match[0].trim();
  let maxLength: number | undefined;
  if (match[3]) {
    const first = match[3].split(',')[0].trim();
    const n = Number.parseInt(first, 10);
    if (Number.isFinite(n)) maxLength = n;
  }
  return { rawType, maxLength, remainder: text.slice(match[0].length).trim() };
}

function baseTypeName(rawType: string): string {
  return rawType.replace(/\(.*$/s, '').trim();
}

function applyTableConstraint(clause: string, entity: Entity, schema: Schema): void {
  let body = clause;
  const named = clause.match(/^constraint\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s+(.*)$/is);
  if (named) body = named[1].trim();

  if (/^primary\s+key/i.test(body)) {
    const inner = outerParens(body);
    if (inner) entity.primaryKey = identList(inner);
    return;
  }

  if (/^unique/i.test(body)) {
    const inner = outerParens(body);
    if (inner) entity.uniques.push(identList(inner));
    return;
  }

  if (/^foreign\s+key/i.test(body)) {
    const cols = outerParens(body);
    const refMatch = body.match(/references\s+([^\s(]+)\s*(\(([^)]*)\))?/i);
    if (cols && refMatch) {
      const fromFields = identList(cols);
      const target = unquoteIdent(refMatch[1]);
      const toFields = refMatch[3] ? identList(refMatch[3]) : ['id'];
      addRelationship(schema, {
        from: entity.name,
        fromFields,
        to: target,
        toFields,
        optional: false,
      });
    }
    return;
  }

  // CHECK, EXCLUDE and LIKE constraints do not change the entity/relationship
  // graph, so they are intentionally dropped.
}

function parseCreateIndex(statement: string, schema: Schema): void {
  const match = statement.match(
    /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([^\s(]+)?\s*on\s+([^\s(]+)\s*(?:using\s+\w+\s*)?(\(.*)$/is,
  );
  if (!match) return;
  const unique = Boolean(match[1]);
  const name = match[2] ? unquoteIdent(match[2]) : undefined;
  const entity = unquoteIdent(match[3]);
  const inner = outerParens(match[4]);
  if (!inner) return;
  schema.indexes.push({ name, entity, fields: identList(inner), unique });
}

function parseAlterTable(statement: string, schema: Schema): void {
  const match = statement.match(/^alter\s+table\s+(?:only\s+)?([^\s]+)\s+(.*)$/is);
  if (!match) return;
  const entity = unquoteIdent(match[1]);
  const action = match[2];

  const fk = action.match(
    /add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*(\([^)]*\))\s*references\s+([^\s(]+)\s*(\(([^)]*)\))?/i,
  );
  if (fk) {
    const fromFields = identList(outerParens(fk[1]) ?? '');
    const target = unquoteIdent(fk[2]);
    const toFields = fk[4] ? identList(fk[4]) : ['id'];
    addRelationship(schema, {
      from: entity,
      fromFields,
      to: target,
      toFields,
      optional: false,
    });
    return;
  }

  const pk = action.match(/add\s+(?:constraint\s+\S+\s+)?primary\s+key\s*(\([^)]*\))/i);
  if (pk) {
    const target = schema.entities.find((e) => e.name.toLowerCase() === entity.toLowerCase());
    if (target) target.primaryKey = identList(outerParens(pk[1]) ?? '');
    return;
  }

  const uq = action.match(/add\s+(?:constraint\s+\S+\s+)?unique\s*(\([^)]*\))/i);
  if (uq) {
    const target = schema.entities.find((e) => e.name.toLowerCase() === entity.toLowerCase());
    if (target) target.uniques.push(identList(outerParens(uq[1]) ?? ''));
  }
}

function addRelationship(schema: Schema, rel: Relationship): void {
  schema.relationships.push(rel);
}
