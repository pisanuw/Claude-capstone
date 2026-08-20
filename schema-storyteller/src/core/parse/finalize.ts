import type { Schema } from '../types.js';
import { findEntity, findField } from '../types.js';

/**
 * Post-pass shared by every parser.
 *
 * Parsers emit relationships as soon as they see them, which is often before
 * the referenced column's nullability is known (a table constraint can appear
 * above the column it names, and an `ALTER TABLE` can arrive whole statements
 * later). This pass runs once the whole document has been read: it back-fills
 * `optional`, mirrors single-column foreign keys onto the field itself, drops
 * relationships pointing at tables the document never defined, and removes
 * duplicate index declarations.
 */
export function finalizeSchema(schema: Schema): Schema {
  const known = new Set(schema.entities.map((e) => e.name.toLowerCase()));

  const kept = [];
  for (const rel of schema.relationships) {
    if (!known.has(rel.to.toLowerCase())) {
      schema.warnings.push(
        `${rel.from}.${rel.fromFields.join(', ')} references "${rel.to}", which is not defined in this document.`,
      );
      continue;
    }

    const fromEntity = findEntity(schema, rel.from);
    if (!fromEntity) continue;

    const fields = rel.fromFields
      .map((name) => findField(fromEntity, name))
      .filter((f) => f !== undefined);

    rel.optional = fields.length > 0 && fields.every((f) => f.nullable);

    if (rel.fromFields.length === 1 && fields.length === 1 && !fields[0].references) {
      fields[0].references = { entity: rel.to, field: rel.toFields[0] ?? 'id' };
    }

    kept.push(rel);
  }
  schema.relationships = kept;

  // A primary key is backed by an index on every engine worth naming, and a
  // single-column UNIQUE is too. Recording them here means the lint rules can
  // ask one question ("is this column indexed?") instead of three.
  for (const entity of schema.entities) {
    if (entity.primaryKey.length > 0) {
      schema.indexes.push({
        name: `${entity.name}_pkey`,
        entity: entity.name,
        fields: [...entity.primaryKey],
        unique: true,
      });
      for (const name of entity.primaryKey) {
        const field = findField(entity, name);
        if (field) field.isPrimaryKey = true;
      }
    }
    for (const cols of entity.uniques) {
      schema.indexes.push({ entity: entity.name, fields: [...cols], unique: true });
      if (cols.length === 1) {
        const field = findField(entity, cols[0]);
        if (field) field.isUnique = true;
      }
    }
    for (const field of entity.fields) {
      if (field.isUnique && !entity.uniques.some((c) => c.length === 1 && c[0].toLowerCase() === field.name.toLowerCase())) {
        schema.indexes.push({ entity: entity.name, fields: [field.name], unique: true });
      }
      if (field.isPrimaryKey) field.nullable = false;
    }
  }

  const seen = new Set<string>();
  schema.indexes = schema.indexes.filter((idx) => {
    const key = `${idx.entity.toLowerCase()}|${idx.fields.map((f) => f.toLowerCase()).join(',')}|${idx.unique}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return schema;
}
