import type { Schema, Entity, Field, FieldType } from '../types.js';
import { emptySchema, makeField } from '../types.js';
import { finalizeSchema } from './finalize.js';

interface JsonSchemaNode {
  type?: string | string[];
  format?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  description?: string;
  title?: string;
  $ref?: string;
  definitions?: Record<string, JsonSchemaNode>;
  $defs?: Record<string, JsonSchemaNode>;
  allOf?: JsonSchemaNode[];
  [k: string]: unknown;
}

/**
 * Parses a JSON Schema document into the IR.
 *
 * Two shapes are supported. A single object schema becomes one entity named
 * from its `title` (default `Root`). A document whose `definitions`/`$defs`
 * hold several object schemas becomes one entity per definition, and any
 * `$ref` between them becomes a relationship. JSON Schema has no first-class
 * foreign keys, so a `$ref` to another definition is the closest analogue and
 * is treated as one.
 */
export function parseJsonSchema(input: string): Schema {
  const schema = emptySchema('json-schema');
  let root: JsonSchemaNode;
  try {
    root = JSON.parse(input) as JsonSchemaNode;
  } catch (err) {
    schema.warnings.push(`Could not parse JSON: ${(err as Error).message}`);
    return schema;
  }

  const defs = { ...(root.definitions ?? {}), ...(root.$defs ?? {}) };
  const defNames = new Set(Object.keys(defs));

  if (Object.keys(defs).length > 0) {
    for (const [name, node] of Object.entries(defs)) {
      const merged = mergeAllOf(node);
      if (isObjectNode(merged)) schema.entities.push(buildEntity(name, merged, defNames, schema));
    }
    // A top-level object alongside definitions is itself an entity (the root).
    const mergedRoot = mergeAllOf(root);
    if (isObjectNode(mergedRoot)) {
      schema.entities.push(buildEntity(rootName(root), mergedRoot, defNames, schema));
    }
  } else {
    const mergedRoot = mergeAllOf(root);
    if (isObjectNode(mergedRoot)) {
      schema.entities.push(buildEntity(rootName(root), mergedRoot, defNames, schema));
    } else {
      schema.warnings.push('Top-level schema is not an object and has no definitions; nothing to describe.');
    }
  }

  return finalizeSchema(schema);
}

function rootName(root: JsonSchemaNode): string {
  return typeof root.title === 'string' && root.title.trim().length > 0 ? root.title.trim() : 'Root';
}

function isObjectNode(node: JsonSchemaNode): boolean {
  const t = node.type;
  const isObj = t === 'object' || (Array.isArray(t) && t.includes('object'));
  return isObj || (node.properties !== undefined && node.properties !== null);
}

/** Folds an `allOf` list of subschemas into a single node (shallow merge). */
function mergeAllOf(node: JsonSchemaNode): JsonSchemaNode {
  if (!Array.isArray(node.allOf)) return node;
  const merged: JsonSchemaNode = { ...node };
  merged.properties = { ...(node.properties ?? {}) };
  merged.required = [...(node.required ?? [])];
  for (const sub of node.allOf) {
    Object.assign(merged.properties, sub.properties ?? {});
    if (Array.isArray(sub.required)) merged.required.push(...sub.required);
    if (sub.type && !merged.type) merged.type = sub.type;
  }
  return merged;
}

function buildEntity(
  name: string,
  node: JsonSchemaNode,
  defNames: Set<string>,
  schema: Schema,
): Entity {
  const entity: Entity = { name, fields: [], primaryKey: [], uniques: [] };
  if (typeof node.description === 'string') entity.comment = node.description;

  const required = new Set(node.required ?? []);
  const props = node.properties ?? {};

  for (const [propName, rawProp] of Object.entries(props)) {
    const prop = mergeAllOf(rawProp);
    const field = buildField(propName, prop, required.has(propName));
    entity.fields.push(field);

    const refTarget = resolveRef(prop) ?? resolveRef(prop.items ?? {});
    if (refTarget && defNames.has(refTarget)) {
      field.references = { entity: refTarget, field: 'id' };
      schema.relationships.push({
        from: name,
        fromFields: [propName],
        to: refTarget,
        toFields: ['id'],
        optional: !required.has(propName),
      });
    }
  }

  // JSON Schema has no primary key concept; treat a required `id` as the key so
  // downstream narration and lint have an anchor, matching common convention.
  const idField = entity.fields.find((f) => f.name.toLowerCase() === 'id' && !f.nullable);
  if (idField) {
    idField.isPrimaryKey = true;
    entity.primaryKey = [idField.name];
  }

  return entity;
}

function buildField(name: string, prop: JsonSchemaNode, required: boolean): Field {
  const isArray = prop.type === 'array' || (Array.isArray(prop.type) && prop.type.includes('array'));
  const effective = isArray && prop.items ? prop.items : prop;
  const rawType = describeRawType(prop);
  const field = makeField(name, rawType, classify(effective));

  field.nullable = !required || nodeAllowsNull(prop);
  field.isArray = isArray;
  if (typeof prop.maxLength === 'number') field.maxLength = prop.maxLength;
  if (Array.isArray(effective.enum)) {
    field.type = 'enum';
    field.enumValues = effective.enum.map((v) => String(v));
  }
  if (prop.pattern !== undefined || prop.minimum !== undefined || prop.maximum !== undefined) {
    field.hasCheck = true;
  }
  if ('default' in prop) {
    field.hasDefault = true;
    field.defaultValue = JSON.stringify(prop.default);
  }
  if (typeof prop.description === 'string') field.comment = prop.description;
  return field;
}

function nodeAllowsNull(node: JsonSchemaNode): boolean {
  return Array.isArray(node.type) && node.type.includes('null');
}

function classify(node: JsonSchemaNode): FieldType {
  if (Array.isArray(node.enum)) return 'enum';
  const format = typeof node.format === 'string' ? node.format : '';
  if (format === 'uuid') return 'uuid';
  if (format === 'date-time') return 'datetime';
  if (format === 'date') return 'date';
  if (format === 'time') return 'time';

  const type = Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;
  switch (type) {
    case 'string':
      return 'string';
    case 'integer':
      return 'integer';
    case 'number':
      return 'decimal';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'json';
    case 'array':
      return 'json';
    default:
      return 'unknown';
  }
}

function describeRawType(node: JsonSchemaNode): string {
  const type = Array.isArray(node.type) ? node.type.join('|') : node.type ?? (node.$ref ? '$ref' : 'unknown');
  return node.format ? `${type} (${node.format})` : type;
}

function resolveRef(node: JsonSchemaNode): string | null {
  if (typeof node.$ref !== 'string') return null;
  const parts = node.$ref.split('/');
  return parts[parts.length - 1] || null;
}
