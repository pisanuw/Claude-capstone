import type { Schema, Entity, Field } from '../types.js';
import { emptySchema, makeField } from '../types.js';
import type { FieldType } from '../types.js';
import { finalizeSchema } from './finalize.js';

const SCALAR_TYPES: Record<string, FieldType> = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'integer',
  BigInt: 'integer',
  Float: 'float',
  Decimal: 'decimal',
  DateTime: 'datetime',
  Json: 'json',
  Bytes: 'binary',
};

interface RawField {
  name: string;
  type: string;
  optional: boolean;
  array: boolean;
  attributes: string;
}

/**
 * Parses a Prisma schema.
 *
 * Prisma models the relationship graph twice: the object-typed "relation
 * field" (`author User @relation(...)`) and the underlying scalar foreign key
 * (`authorId Int`). We record the foreign key from the scalar side (that is
 * where nullability and the real column live) and use the relation field only
 * to discover the target model. Enums are collected first so a field typed as
 * an enum is classified correctly.
 */
export function parsePrisma(input: string): Schema {
  const schema = emptySchema('prisma');
  const enums = collectEnums(input);

  for (const block of matchBlocks(input, 'model')) {
    const entity: Entity = { name: block.name, fields: [], primaryKey: [], uniques: [] };
    const rawFields = parseFieldLines(block.body);
    const scalarNames = new Set(
      rawFields.filter((f) => isScalar(f.type, enums)).map((f) => f.name.toLowerCase()),
    );

    for (const rf of rawFields) {
      if (isScalar(rf.type, enums)) {
        entity.fields.push(buildScalarField(rf, enums, entity));
      } else {
        applyRelationField(rf, entity, schema, scalarNames);
      }
    }

    applyBlockAttributes(block.body, entity);
    schema.entities.push(entity);
  }

  return finalizeSchema(schema);
}

function isScalar(type: string, enums: Map<string, string[]>): boolean {
  return type in SCALAR_TYPES || enums.has(type);
}

function buildScalarField(rf: RawField, enums: Map<string, string[]>, entity: Entity): Field {
  const enumValues = enums.get(rf.type);
  const type: FieldType = enumValues ? 'enum' : SCALAR_TYPES[rf.type] ?? 'unknown';
  const field = makeField(rf.name, rf.type + (rf.array ? '[]' : ''), type);
  field.nullable = rf.optional && !rf.array;
  field.isArray = rf.array;
  if (enumValues) field.enumValues = enumValues;

  const attrs = rf.attributes;
  if (/@id\b/.test(attrs)) {
    field.isPrimaryKey = true;
    field.nullable = false;
    entity.primaryKey = [rf.name];
  }
  if (/@unique\b/.test(attrs)) field.isUnique = true;
  if (/@default\(/.test(attrs)) {
    field.hasDefault = true;
    const def = attrs.match(/@default\(([^)]*)\)/);
    if (def) field.defaultValue = def[1].trim();
  }
  const len = attrs.match(/@db\.VarChar\((\d+)\)/);
  if (len) field.maxLength = Number.parseInt(len[1], 10);
  return field;
}

function applyRelationField(
  rf: RawField,
  entity: Entity,
  schema: Schema,
  scalarNames: Set<string>,
): void {
  const rel = rf.attributes.match(/@relation\(([^)]*)\)/);
  if (!rel) return; // Back-reference with no @relation: the other side owns the FK.

  const fieldsMatch = rel[1].match(/fields:\s*\[([^\]]*)\]/);
  const refsMatch = rel[1].match(/references:\s*\[([^\]]*)\]/);
  if (!fieldsMatch) return; // This side is the referenced end, not the owner.

  const fromFields = splitIdentList(fieldsMatch[1]);
  const toFields = refsMatch ? splitIdentList(refsMatch[1]) : ['id'];
  // Only the FK-owning side names `fields:`; mark those scalars as the FK.
  for (const f of fromFields) scalarNames.add(f.toLowerCase());

  schema.relationships.push({
    from: entity.name,
    fromFields,
    to: rf.type,
    toFields,
    optional: rf.optional,
    name: extractRelationName(rel[1]),
  });
}

function extractRelationName(args: string): string | undefined {
  const quoted = args.match(/^\s*"([^"]*)"/);
  return quoted ? quoted[1] : undefined;
}

function applyBlockAttributes(body: string, entity: Entity): void {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const id = trimmed.match(/^@@id\(\[([^\]]*)\]/);
    if (id) entity.primaryKey = splitIdentList(id[1]);
    const uq = trimmed.match(/^@@unique\(\[([^\]]*)\]/);
    if (uq) entity.uniques.push(splitIdentList(uq[1]));
  }
}

function collectEnums(input: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  for (const block of matchBlocks(input, 'enum')) {
    const values = block.body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0]);
    enums.set(block.name, values);
  }
  return enums;
}

interface Block {
  name: string;
  body: string;
}

/** Finds all `keyword Name { ... }` blocks, tolerating nested braces in bodies. */
function matchBlocks(input: string, keyword: string): Block[] {
  const blocks: Block[] = [];
  const re = new RegExp(`\\b${keyword}\\s+([A-Za-z_][\\w]*)\\s*\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const start = re.lastIndex;
    let depth = 1;
    let i = start;
    for (; i < input.length && depth > 0; i += 1) {
      if (input[i] === '{') depth += 1;
      else if (input[i] === '}') depth -= 1;
    }
    blocks.push({ name: m[1], body: input.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}

function parseFieldLines(body: string): RawField[] {
  const fields: RawField[] = [];
  for (const rawLine of body.split('\n')) {
    const line = stripLineComment(rawLine).trim();
    if (line.length === 0 || line.startsWith('@@') || line.startsWith('//')) continue;

    const match = line.match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w]*)(\[\])?(\?)?\s*(.*)$/);
    if (!match) continue;
    fields.push({
      name: match[1],
      type: match[2],
      array: Boolean(match[3]),
      optional: Boolean(match[4]),
      attributes: match[5] ?? '',
    });
  }
  return fields;
}

function stripLineComment(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

function splitIdentList(inner: string): string[] {
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}
