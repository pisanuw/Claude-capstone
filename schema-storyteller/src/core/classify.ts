import type { Schema, Entity, Relationship } from './types.js';
import { findEntity, findField } from './types.js';

/**
 * Higher-level structure derived from the parsed IR: which entities are join
 * tables, the cardinality of each relationship, and which entities look like
 * lookup/reference tables. The narrator and lint stages consume this so they
 * do not each re-derive the same facts.
 */

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface ClassifiedRelationship extends Relationship {
  cardinality: Cardinality;
}

export interface EntityRole {
  entity: string;
  /** A join/junction table: two-plus FKs, PK made of those FKs, few other columns. */
  isJoinTable: boolean;
  /** A small reference/lookup table: few columns, mostly code + label. */
  isLookupTable: boolean;
  /** Entities this one points at via foreign keys. */
  referencesTo: string[];
  /** Entities that point at this one. */
  referencedBy: string[];
}

export interface Classification {
  relationships: ClassifiedRelationship[];
  roles: Map<string, EntityRole>;
}

export function classify(schema: Schema): Classification {
  const roles = new Map<string, EntityRole>();
  for (const entity of schema.entities) {
    roles.set(entity.name.toLowerCase(), {
      entity: entity.name,
      isJoinTable: false,
      isLookupTable: false,
      referencesTo: [],
      referencedBy: [],
    });
  }

  for (const rel of schema.relationships) {
    const from = roles.get(rel.from.toLowerCase());
    const to = roles.get(rel.to.toLowerCase());
    if (from && !from.referencesTo.includes(rel.to)) from.referencesTo.push(rel.to);
    if (to && !to.referencedBy.includes(rel.from)) to.referencedBy.push(rel.from);
  }

  for (const entity of schema.entities) {
    const role = roles.get(entity.name.toLowerCase());
    if (!role) continue;
    role.isJoinTable = looksLikeJoinTable(entity, schema);
    role.isLookupTable = looksLikeLookupTable(entity);
  }

  const relationships = schema.relationships.map((rel) => ({
    ...rel,
    cardinality: cardinalityOf(rel, schema),
  }));

  return { relationships, roles };
}

/**
 * A foreign key's cardinality from the child's side. The FK columns being
 * unique (or the whole primary key) means at most one child per parent, i.e.
 * one-to-one; otherwise many children per parent, i.e. many-to-one.
 */
export function cardinalityOf(rel: Relationship, schema: Schema): Cardinality {
  const child = findEntity(schema, rel.from);
  if (!child) return 'many-to-one';

  const fkCols = rel.fromFields.map((f) => f.toLowerCase());
  const pkCols = child.primaryKey.map((c) => c.toLowerCase());
  const fkIsWholePk =
    pkCols.length > 0 &&
    pkCols.length === fkCols.length &&
    fkCols.every((c) => pkCols.includes(c));

  const fkIsUnique =
    (rel.fromFields.length === 1 && isFieldUnique(child, rel.fromFields[0])) ||
    child.uniques.some(
      (u) =>
        u.length === fkCols.length &&
        u.every((c) => fkCols.includes(c.toLowerCase())),
    );

  return fkIsWholePk || fkIsUnique ? 'one-to-one' : 'many-to-one';
}

function isFieldUnique(entity: Entity, name: string): boolean {
  const field = findField(entity, name);
  if (!field) return false;
  if (field.isUnique) return true;
  // Being part of a *composite* primary key does not make a column unique on
  // its own, so only a single-column PK counts here.
  return entity.primaryKey.length === 1 && field.isPrimaryKey;
}

function looksLikeJoinTable(entity: Entity, schema: Schema): boolean {
  const fks = schema.relationships.filter(
    (r) => r.from.toLowerCase() === entity.name.toLowerCase(),
  );
  const fkColumns = new Set(fks.flatMap((r) => r.fromFields.map((f) => f.toLowerCase())));
  if (fks.length < 2 || fkColumns.size < 2) return false;

  // Columns that are not part of a foreign key and not bookkeeping timestamps.
  const payload = entity.fields.filter((f) => {
    const n = f.name.toLowerCase();
    if (fkColumns.has(n)) return false;
    if (['id', 'created_at', 'updated_at', 'createdat', 'updatedat'].includes(n)) return false;
    return true;
  });

  const pk = entity.primaryKey.map((c) => c.toLowerCase());
  const pkIsFks = pk.length >= 2 && pk.every((c) => fkColumns.has(c));

  return pkIsFks || payload.length <= 1;
}

function looksLikeLookupTable(entity: Entity): boolean {
  if (entity.fields.length === 0 || entity.fields.length > 4) return false;
  const names = entity.fields.map((f) => f.name.toLowerCase());
  const hasLabel = names.some((n) =>
    ['name', 'label', 'title', 'code', 'value', 'description', 'type'].some((k) => n.includes(k)),
  );
  const hasId = names.some((n) => n === 'id' || n.endsWith('_id') || n === 'code');
  return hasLabel && hasId;
}

/** The inverse phrasing of a cardinality, for narrating the parent's side. */
export function inverseCardinality(c: Cardinality): Cardinality {
  switch (c) {
    case 'one-to-many':
      return 'many-to-one';
    case 'many-to-one':
      return 'one-to-many';
    default:
      return c;
  }
}
