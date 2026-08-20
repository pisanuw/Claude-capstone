/**
 * The intermediate representation every parser targets.
 *
 * SQL DDL, Prisma schemas and JSON Schema documents describe the same handful
 * of ideas (things, their attributes, and the links between them) in three
 * different dialects. Every parser normalizes into the types below, so the
 * vocabulary, classification, lint and narration stages only ever deal with one
 * shape.
 */

export type SchemaFormat = 'sql' | 'prisma' | 'json-schema';

export type FieldType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'float'
  | 'boolean'
  | 'datetime'
  | 'date'
  | 'time'
  | 'uuid'
  | 'json'
  | 'binary'
  | 'enum'
  | 'unknown';

export interface FieldReference {
  entity: string;
  field: string;
}

export interface Field {
  name: string;
  /** The type exactly as it was written in the source. */
  rawType: string;
  type: FieldType;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  /** True for list-valued fields (JSON Schema arrays, Prisma `Type[]`). */
  isArray: boolean;
  /** Declared length for character types, when the source gave one. */
  maxLength?: number;
  enumValues?: string[];
  references?: FieldReference;
  /** True when the source constrained the value (SQL CHECK, JSON Schema pattern). */
  hasCheck: boolean;
  comment?: string;
}

export interface Index {
  name?: string;
  entity: string;
  fields: string[];
  unique: boolean;
}

export interface Entity {
  name: string;
  fields: Field[];
  /** Column names forming the primary key; empty when none was declared. */
  primaryKey: string[];
  /** Unique constraints spanning one or more columns. */
  uniques: string[][];
  comment?: string;
}

export interface Relationship {
  from: string;
  fromFields: string[];
  to: string;
  toFields: string[];
  /** True when the referencing columns are all nullable. */
  optional: boolean;
  name?: string;
}

export interface Schema {
  format: SchemaFormat;
  entities: Entity[];
  relationships: Relationship[];
  indexes: Index[];
  /** Non-fatal notes from the parser (skipped statements, unknown constructs). */
  warnings: string[];
}

export function emptySchema(format: SchemaFormat): Schema {
  return { format, entities: [], relationships: [], indexes: [], warnings: [] };
}

export function makeField(name: string, rawType: string, type: FieldType): Field {
  return {
    name,
    rawType,
    type,
    nullable: true,
    isPrimaryKey: false,
    isUnique: false,
    hasDefault: false,
    isArray: false,
    hasCheck: false,
  };
}

export function findEntity(schema: Schema, name: string): Entity | undefined {
  const wanted = name.toLowerCase();
  return schema.entities.find((e) => e.name.toLowerCase() === wanted);
}

export function findField(entity: Entity, name: string): Field | undefined {
  const wanted = name.toLowerCase();
  return entity.fields.find((f) => f.name.toLowerCase() === wanted);
}
