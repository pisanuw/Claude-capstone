import type { Schema, Entity, Field } from './types.js';
import type { Classification } from './classify.js';
import { humanizeEntity, humanizeField, suggestRename } from './vocabulary.js';

/**
 * The rule-based reviewer. Every finding the original idea wanted from an LLM
 * ("potentially missing constraints, indexes, or foreign keys") is produced
 * here by fixed rules over the parsed IR, so the review is explainable and
 * reproducible.
 */

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  entity?: string;
  field?: string;
  message: string;
}

const TIMESTAMP_HINTS = ['_at', '_on', '_date', '_time', 'created', 'updated', 'modified', 'deleted'];

export function lint(schema: Schema, classification: Classification): Finding[] {
  const findings: Finding[] = [];

  for (const entity of schema.entities) {
    checkPrimaryKey(entity, findings);
    checkForeignKeyIndexes(entity, schema, classification, findings);
    for (const field of entity.fields) {
      checkImpliedForeignKey(entity, field, schema, findings);
      checkUnboundedString(entity, field, findings);
      checkTimestampType(entity, field, findings);
      checkBooleanNullable(entity, field, findings);
      checkCrypticName(entity, field, findings);
    }
    checkAuditColumns(entity, classification, findings);
    checkEntityName(entity, findings);
  }

  // Stable, useful ordering: worst first, then by entity so related notes group.
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  return findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.entity ?? '').localeCompare(b.entity ?? ''),
  );
}

function checkPrimaryKey(entity: Entity, findings: Finding[]): void {
  if (entity.fields.length === 0) return;
  if (entity.primaryKey.length === 0) {
    findings.push({
      rule: 'missing-primary-key',
      severity: 'high',
      entity: entity.name,
      message: `${humanizeEntity(entity.name)} table has no primary key. Rows cannot be uniquely identified, which breaks updates, deletes, and replication.`,
    });
  }
}

/** Every FK column should be indexed, or lookups and cascades scan the child table. */
function checkForeignKeyIndexes(
  entity: Entity,
  schema: Schema,
  classification: Classification,
  findings: Finding[],
): void {
  const fks = schema.relationships.filter(
    (r) => r.from.toLowerCase() === entity.name.toLowerCase(),
  );
  for (const fk of fks) {
    if (isIndexedPrefix(entity, schema, fk.fromFields)) continue;
    const role = classification.roles.get(entity.name.toLowerCase());
    // A join table's composite PK already indexes its first FK column; only the
    // trailing FK column typically needs its own index.
    findings.push({
      rule: 'unindexed-foreign-key',
      severity: role?.isJoinTable ? 'low' : 'medium',
      entity: entity.name,
      field: fk.fromFields.join(', '),
      message: `Foreign key ${entity.name}(${fk.fromFields.join(', ')}) -> ${fk.to} is not covered by an index. Joins and cascading deletes on this key will scan the whole table.`,
    });
  }
}

function isIndexedPrefix(entity: Entity, schema: Schema, cols: string[]): boolean {
  const target = cols.map((c) => c.toLowerCase());
  return schema.indexes.some((idx) => {
    if (idx.entity.toLowerCase() !== entity.name.toLowerCase()) return false;
    const prefix = idx.fields.slice(0, target.length).map((f) => f.toLowerCase());
    return prefix.length === target.length && prefix.every((f, i) => f === target[i]);
  });
}

/** A column named like `<thing>_id` with no declared FK is probably an orphan FK. */
function checkImpliedForeignKey(
  entity: Entity,
  field: Field,
  schema: Schema,
  findings: Finding[],
): void {
  if (field.references) return;
  const name = field.name.toLowerCase();
  if (name === 'id' || !(name.endsWith('_id') || name.endsWith('id')) ) return;
  if (name === 'uuid' || name === 'guid' || name.endsWith('void') || name.endsWith('grid')) return;

  const base = name.replace(/_?id$/, '');
  if (base.length < 2) return;

  // Only flag when a plausible target table actually exists in the document.
  const candidates = [base, `${base}s`, `${base}es`];
  const target = schema.entities.find((e) => {
    const en = e.name.toLowerCase();
    return candidates.includes(en) || candidates.includes(en.replace(/ies$/, 'y'));
  });
  if (!target || target.name.toLowerCase() === entity.name.toLowerCase()) return;

  findings.push({
    rule: 'implied-foreign-key',
    severity: 'medium',
    entity: entity.name,
    field: field.name,
    message: `${entity.name}.${field.name} looks like a foreign key to ${target.name}, but no FOREIGN KEY constraint enforces it. Orphan rows can accumulate.`,
  });
}

function checkUnboundedString(entity: Entity, field: Field, findings: Finding[]): void {
  if (field.type !== 'string') return;
  const raw = field.rawType.toLowerCase();
  const isText = raw.includes('text') || raw.includes('clob') || raw === 'string';
  const nameHintsShort = /(name|code|slug|email|phone|status|type|title|state|country|currency|locale)/.test(
    field.name.toLowerCase(),
  );
  if (isText && nameHintsShort) {
    findings.push({
      rule: 'unbounded-string',
      severity: 'low',
      entity: entity.name,
      field: field.name,
      message: `${entity.name}.${field.name} is an unbounded text column but its name suggests a short value. A length limit (e.g. VARCHAR(n)) documents intent and guards against runaway input.`,
    });
  }
}

function checkTimestampType(entity: Entity, field: Field, findings: Finding[]): void {
  const name = field.name.toLowerCase();
  const looksTemporal = TIMESTAMP_HINTS.some((h) => name.includes(h) || name.endsWith(h));
  if (!looksTemporal) return;
  if (['datetime', 'date', 'time'].includes(field.type)) return;
  if (field.type === 'integer' && (name.includes('count') || name.includes('id'))) return;
  findings.push({
    rule: 'temporal-name-wrong-type',
    severity: 'low',
    entity: entity.name,
    field: field.name,
    message: `${entity.name}.${field.name} is named like a timestamp but is typed ${field.rawType}. Using a DATE/TIMESTAMP type enables range queries and timezone handling.`,
  });
}

function checkBooleanNullable(entity: Entity, field: Field, findings: Finding[]): void {
  if (field.type !== 'boolean' || !field.nullable) return;
  findings.push({
    rule: 'nullable-boolean',
    severity: 'low',
    entity: entity.name,
    field: field.name,
    message: `${entity.name}.${field.name} is a nullable boolean, so it has three states (true/false/unknown). Add NOT NULL DEFAULT to make the flag unambiguous unless the third state is intentional.`,
  });
}

function checkCrypticName(entity: Entity, field: Field, findings: Finding[]): void {
  const suggestion = suggestRename(field.name);
  if (!suggestion) return;
  findings.push({
    rule: 'cryptic-name',
    severity: 'info',
    entity: entity.name,
    field: field.name,
    message: `${entity.name}.${field.name} reads as "${humanizeField(field.name)}". Consider renaming to ${suggestion} for clarity.`,
  });
}

/** Business tables usually carry created/updated columns; note their absence. */
function checkAuditColumns(
  entity: Entity,
  classification: Classification,
  findings: Finding[],
): void {
  const role = classification.roles.get(entity.name.toLowerCase());
  if (role?.isJoinTable || role?.isLookupTable) return;
  if (entity.fields.length < 3) return;
  const names = entity.fields.map((f) => f.name.toLowerCase());
  const hasCreated = names.some((n) => n.includes('created') || n === 'inserted_at');
  if (!hasCreated) {
    findings.push({
      rule: 'missing-audit-columns',
      severity: 'info',
      entity: entity.name,
      message: `${humanizeEntity(entity.name)} has no created-at column. Audit timestamps (created_at / updated_at) are cheap to add and hard to backfill later.`,
    });
  }
}

function checkEntityName(entity: Entity, findings: Finding[]): void {
  const suggestion = suggestRename(entity.name);
  if (!suggestion) return;
  findings.push({
    rule: 'cryptic-table-name',
    severity: 'info',
    entity: entity.name,
    message: `Table "${entity.name}" reads as "${humanizeEntity(entity.name)}". A clearer name such as ${suggestion} would help newcomers.`,
  });
}
