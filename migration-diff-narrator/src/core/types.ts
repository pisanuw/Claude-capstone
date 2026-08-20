/**
 * Intermediate representation shared by the SQL and TypeScript parsers.
 *
 * Both inputs are normalized into a `SchemaModel` of named entities (tables or
 * interfaces) whose columns carry enough detail — raw type, normalized family,
 * size, nullability, defaults — for the diff engine to classify changes.
 */

export type SourceKind = 'sql' | 'typescript';

/** Normalized type family used to decide widening vs narrowing. */
export type TypeFamily =
  | 'integer'
  | 'decimal'
  | 'float'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'uuid'
  | 'json'
  | 'binary'
  | 'string'
  | 'enum'
  | 'array'
  | 'object'
  | 'literal'
  | 'unknown';

export interface Column {
  name: string;
  /** The type exactly as written, e.g. `VARCHAR(120)` or `string | null`. */
  rawType: string;
  family: TypeFamily;
  /** varchar/char length, or decimal precision. */
  maxLength?: number;
  /** decimal scale (digits after the point). */
  scale?: number;
  /** Integer width rank, when the family is integer: 1=tinyint … 4=bigint. */
  intRank?: number;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  /** TS-only: declared readonly. */
  readonly: boolean;
  /** For enum/literal-union types: the allowed members, when known. */
  members?: string[];
  /** Inline REFERENCES target, SQL only. */
  references?: { entity: string; column: string };
  /** 0-based position within the entity, used by the rename heuristic. */
  position: number;
}

export interface IndexDef {
  name?: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKeyDef {
  columns: string[];
  refEntity: string;
  refColumns: string[];
}

export interface Entity {
  name: string;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  indexes: IndexDef[];
  foreignKeys: ForeignKeyDef[];
}

export interface SchemaModel {
  kind: SourceKind;
  entities: Entity[];
  /** Non-fatal notes from the parser, surfaced in the UI. */
  warnings: string[];
}

export function emptyModel(kind: SourceKind): SchemaModel {
  return { kind, entities: [], warnings: [] };
}

export function makeEntity(name: string): Entity {
  return { name, columns: [], primaryKey: [], uniques: [], indexes: [], foreignKeys: [] };
}

export function makeColumn(name: string, rawType: string, family: TypeFamily, position: number): Column {
  return {
    name,
    rawType,
    family,
    nullable: true,
    hasDefault: false,
    autoIncrement: false,
    isPrimaryKey: false,
    isUnique: false,
    readonly: false,
    position,
  };
}

/* ------------------------------------------------------------------ */
/* Diff output                                                         */
/* ------------------------------------------------------------------ */

export type Severity = 'safe' | 'caution' | 'breaking';

export type ChangeKind =
  | 'entity-added'
  | 'entity-removed'
  | 'entity-renamed'
  | 'column-added'
  | 'column-removed'
  | 'column-renamed'
  | 'type-changed'
  | 'nullability-changed'
  | 'default-changed'
  | 'primary-key-changed'
  | 'unique-changed'
  | 'index-added'
  | 'index-removed'
  | 'foreign-key-added'
  | 'foreign-key-removed'
  | 'readonly-changed'
  | 'auto-increment-changed';

export interface Change {
  kind: ChangeKind;
  severity: Severity;
  /** Entity the change belongs to (the new name, for renames). */
  entity: string;
  /** Column the change belongs to, when column-scoped. */
  column?: string;
  /** One-line human description of what changed. */
  summary: string;
  /** One-sentence migration guidance. */
  note: string;
  /** Before/after snippets for display, when meaningful. */
  before?: string;
  after?: string;
}

export interface DiffResult {
  changes: Change[];
  counts: { safe: number; caution: number; breaking: number };
}
