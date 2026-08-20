import type { SchemaModel, Entity, Column } from '../types.js';
import { emptyModel, makeEntity, makeColumn } from '../types.js';
import {
  stripComments,
  splitStatements,
  splitOn,
  outerParens,
  unquoteIdent,
  identList,
  readIdentToken,
} from './sqlLexer.js';
import { normalizeSqlType, sqlIntRank, MULTIWORD_TYPES } from './sqlTypes.js';

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

/**
 * Parses a subset of ANSI / PostgreSQL / MySQL DDL into the IR: CREATE TABLE,
 * CREATE INDEX, and the ALTER TABLE forms that add constraints. Each input is
 * expected to be a complete schema version, so ALTER ... ADD/DROP COLUMN is
 * also applied in order.
 */
export function parseSql(input: string): SchemaModel {
  const model = emptyModel('sql');
  const clean = stripComments(input);

  for (const statement of splitStatements(clean)) {
    const head = statement.replace(/^\s+/, '');
    if (/^create\s+(temp(orary)?\s+)?table/i.test(head)) {
      parseCreateTable(head, model);
    } else if (/^create\s+(unique\s+)?index/i.test(head)) {
      parseCreateIndex(head, model);
    } else if (/^alter\s+table/i.test(head)) {
      parseAlterTable(head, model);
    } else if (/^create\s+type\s+\S+\s+as\s+enum/i.test(head)) {
      // Postgres enum types: remembered so columns using them classify as enum.
      parseCreateEnum(head, model);
    }
    // Everything else (INSERT, CREATE VIEW, SET, ...) does not shape the model.
  }

  return model;
}

/** Postgres `CREATE TYPE mood AS ENUM ('a','b')` — name -> members. */
const enumTypes = new WeakMap<SchemaModel, Map<string, string[]>>();

function parseCreateEnum(statement: string, model: SchemaModel): void {
  const match = statement.match(/^create\s+type\s+([^\s]+)\s+as\s+enum\s*(\(.*)$/is);
  if (!match) return;
  const name = unquoteIdent(match[1]).toLowerCase();
  const inner = outerParens(match[2]);
  if (inner === null) return;
  const members = splitOn(inner, ',')
    .map((m) => m.trim().replace(/^'(.*)'$/s, '$1'))
    .filter((m) => m.length > 0);
  let map = enumTypes.get(model);
  if (!map) {
    map = new Map();
    enumTypes.set(model, map);
  }
  map.set(name, members);
}

function findEntity(model: SchemaModel, name: string): Entity | undefined {
  return model.entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
}

function parseCreateTable(statement: string, model: SchemaModel): void {
  const prefix = statement.match(/^create\s+(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?/i);
  if (!prefix) return;
  const name = unquoteIdent(readIdentToken(statement.slice(prefix[0].length)));

  const body = outerParens(statement);
  const entity = makeEntity(name);
  if (body === null) {
    model.warnings.push(`Table ${name} has no readable column list; it is compared by name only.`);
    model.entities.push(entity);
    return;
  }

  for (const rawClause of splitOn(body, ',')) {
    const clause = rawClause.trim();
    if (clause.length === 0) continue;

    const firstWord = clause.split(/[\s(]/)[0].toLowerCase();
    if (CONSTRAINT_KEYWORDS.has(firstWord)) {
      applyTableConstraint(clause, entity);
    } else {
      const column = parseColumn(clause, entity.columns.length, model);
      if (column) entity.columns.push(column);
    }
  }

  // Columns named in a table-level PRIMARY KEY are NOT NULL by definition.
  for (const pk of entity.primaryKey) {
    const col = entity.columns.find((c) => c.name.toLowerCase() === pk.toLowerCase());
    if (col) {
      col.isPrimaryKey = true;
      col.nullable = false;
    }
  }

  model.entities.push(entity);
}

function parseColumn(clause: string, position: number, model: SchemaModel): Column | null {
  const nameMatch = clause.match(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s*(.*)$/s);
  if (!nameMatch) return null;

  const name = unquoteIdent(nameMatch[1]);
  let rest = nameMatch[2].trim();

  const { rawType, maxLength, scale, remainder } = consumeType(rest);
  rest = remainder;

  const baseName = rawType.replace(/\(.*$/s, '').trim();
  let family = normalizeSqlType(baseName);
  const column = makeColumn(name, rawType, family, position);
  if (maxLength !== undefined) column.maxLength = maxLength;
  if (scale !== undefined) column.scale = scale;
  const rank = sqlIntRank(baseName);
  if (rank !== undefined) column.intRank = rank;

  // Custom Postgres enum type?
  const enums = enumTypes.get(model);
  const enumMembers = enums?.get(baseName.toLowerCase());
  if (family === 'unknown' && enumMembers) {
    family = 'enum';
    column.family = 'enum';
    column.members = enumMembers;
  }
  // MySQL inline ENUM('a','b').
  if (family === 'enum' && /^enum/i.test(baseName)) {
    const inner = outerParens(rawType);
    if (inner !== null) {
      column.members = splitOn(inner, ',')
        .map((m) => m.trim().replace(/^'(.*)'$/s, '$1'))
        .filter((m) => m.length > 0);
    }
  }

  const upper = ` ${rest.toUpperCase()} `;
  const typeAndRest = `${rawType.toUpperCase()} ${upper}`;
  if (/\bNOT\s+NULL\b/.test(upper)) column.nullable = false;
  if (/\bPRIMARY\s+KEY\b/.test(upper)) {
    column.isPrimaryKey = true;
    column.nullable = false;
  }
  if (/\bUNIQUE\b/.test(upper)) column.isUnique = true;
  if (/\b(SERIAL|BIGSERIAL|SMALLSERIAL|AUTO_INCREMENT|IDENTITY|AUTOINCREMENT)\b/.test(typeAndRest)) {
    column.autoIncrement = true;
    column.hasDefault = true;
  }

  const def = rest.match(
    /\bDEFAULT\s+(.+?)(?=\s+(?:NOT|NULL|PRIMARY|UNIQUE|CHECK|REFERENCES|COLLATE|GENERATED|COMMENT)\b|$)/is,
  );
  if (def) {
    column.hasDefault = true;
    column.defaultValue = def[1].trim();
  }

  const inlineRef = rest.match(/\bREFERENCES\s+([^\s(]+)\s*(\(([^)]*)\))?/i);
  if (inlineRef) {
    const target = unquoteIdent(inlineRef[1]);
    const targetCols = inlineRef[3] ? identList(inlineRef[3]) : ['id'];
    column.references = { entity: target, column: targetCols[0] ?? 'id' };
  }

  return column;
}

/** Reads the type token(s) off the front of a column definition. */
function consumeType(text: string): {
  rawType: string;
  maxLength?: number;
  scale?: number;
  remainder: string;
} {
  const lower = text.toLowerCase();
  for (const mw of MULTIWORD_TYPES) {
    if (lower.startsWith(mw)) {
      let end = mw.length;
      let maxLength: number | undefined;
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
  let scale: number | undefined;
  if (match[3]) {
    const parts = match[3].split(',').map((p) => p.trim());
    const n = Number.parseInt(parts[0], 10);
    if (Number.isFinite(n)) maxLength = n;
    if (parts.length > 1) {
      const s = Number.parseInt(parts[1], 10);
      if (Number.isFinite(s)) scale = s;
    }
  }
  return { rawType, maxLength, scale, remainder: text.slice(match[0].length).trim() };
}

function applyTableConstraint(clause: string, entity: Entity): void {
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

  // MySQL in-table KEY / INDEX (col, ...).
  if (/^(key|index)\b/i.test(body)) {
    const inner = outerParens(body);
    if (inner) entity.indexes.push({ columns: identList(inner), unique: false });
    return;
  }

  if (/^foreign\s+key/i.test(body)) {
    const cols = outerParens(body);
    const refMatch = body.match(/references\s+([^\s(]+)\s*(\(([^)]*)\))?/i);
    if (cols && refMatch) {
      entity.foreignKeys.push({
        columns: identList(cols),
        refEntity: unquoteIdent(refMatch[1]),
        refColumns: refMatch[3] ? identList(refMatch[3]) : ['id'],
      });
    }
    return;
  }
  // CHECK / EXCLUDE / LIKE constraints do not participate in the diff.
}

function parseCreateIndex(statement: string, model: SchemaModel): void {
  const match = statement.match(
    /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([^\s(]+)?\s*on\s+([^\s(]+)\s*(?:using\s+\w+\s*)?(\(.*)$/is,
  );
  if (!match) return;
  const inner = outerParens(match[4]);
  if (inner === null) return;
  const entityName = unquoteIdent(match[3]);
  let entity = findEntity(model, entityName);
  if (!entity) {
    entity = makeEntity(entityName);
    model.entities.push(entity);
  }
  entity.indexes.push({
    name: match[2] ? unquoteIdent(match[2]) : undefined,
    columns: identList(inner),
    unique: Boolean(match[1]),
  });
}

function parseAlterTable(statement: string, model: SchemaModel): void {
  const match = statement.match(/^alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([^\s]+)\s+(.*)$/is);
  if (!match) return;
  const entity = findEntity(model, unquoteIdent(match[1]));
  if (!entity) return;
  const action = match[2];

  const addCol = action.match(/^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?(.*)$/is);
  if (addCol && !/^add\s+(constraint|primary|foreign|unique|check|index|key)\b/i.test(action)) {
    const column = parseColumn(addCol[1], entity.columns.length, model);
    if (column) entity.columns.push(column);
    return;
  }

  const dropCol = action.match(/^drop\s+(?:column\s+)?(?:if\s+exists\s+)?([^\s,]+)/is);
  if (dropCol && !/^drop\s+(constraint|primary|foreign|index|key)\b/i.test(action)) {
    const name = unquoteIdent(dropCol[1]);
    entity.columns = entity.columns.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
    return;
  }

  const fk = action.match(
    /add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*(\([^)]*\))\s*references\s+([^\s(]+)\s*(\(([^)]*)\))?/i,
  );
  if (fk) {
    entity.foreignKeys.push({
      columns: identList(outerParens(fk[1]) ?? ''),
      refEntity: unquoteIdent(fk[2]),
      refColumns: fk[4] ? identList(fk[4]) : ['id'],
    });
    return;
  }

  const pk = action.match(/add\s+(?:constraint\s+\S+\s+)?primary\s+key\s*(\([^)]*\))/i);
  if (pk) {
    entity.primaryKey = identList(outerParens(pk[1]) ?? '');
    return;
  }

  const uq = action.match(/add\s+(?:constraint\s+\S+\s+)?unique\s*(\([^)]*\))/i);
  if (uq) {
    entity.uniques.push(identList(outerParens(uq[1]) ?? ''));
  }
}
