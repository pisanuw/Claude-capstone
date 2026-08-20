import { describe, it, expect } from 'vitest';
import { parseJsonSchema } from '../src/core/parse/jsonSchema.js';
import { detectFormat, parseSchema } from '../src/core/parse/index.js';
import { findEntity, findField } from '../src/core/types.js';
import { JSON_SCHEMA_LIBRARY, JSON_SCHEMA_SINGLE } from './fixtures.js';

describe('parseJsonSchema', () => {
  it('creates one entity per definition', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_LIBRARY);
    expect(schema.entities.map((e) => e.name).sort()).toEqual(['Author', 'Book']);
  });

  it('classifies formats into IR types', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_LIBRARY);
    const author = findEntity(schema, 'Author')!;
    expect(findField(author, 'id')!.type).toBe('uuid');
    expect(findField(author, 'born')!.type).toBe('date');
    expect(findField(author, 'name')!.maxLength).toBe(120);
  });

  it('turns a $ref into a relationship', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_LIBRARY);
    const rel = schema.relationships.find((r) => r.from === 'Book' && r.to === 'Author');
    expect(rel).toBeDefined();
    expect(rel!.optional).toBe(false); // author is required
  });

  it('reads required-ness and nullable union types', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_LIBRARY);
    const book = findEntity(schema, 'Book')!;
    expect(findField(book, 'title')!.nullable).toBe(false);
    expect(findField(book, 'inPrint')!.nullable).toBe(true);
    expect(findField(book, 'genre')!.type).toBe('enum');
    expect(findField(book, 'genre')!.enumValues).toEqual(['fiction', 'nonfiction', 'poetry']);
  });

  it('treats a required id as the primary key', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_LIBRARY);
    expect(findEntity(schema, 'Book')!.primaryKey).toEqual(['id']);
  });

  it('parses a single object schema using its title', () => {
    const schema = parseJsonSchema(JSON_SCHEMA_SINGLE);
    expect(schema.entities[0].name).toBe('Widget');
    const tags = findField(schema.entities[0], 'tags')!;
    expect(tags.isArray).toBe(true);
    const price = findField(schema.entities[0], 'price')!;
    expect(price.type).toBe('decimal');
    expect(price.hasCheck).toBe(true); // minimum
  });

  it('reports a warning on invalid JSON', () => {
    const schema = parseJsonSchema('{ not valid');
    expect(schema.entities).toHaveLength(0);
    expect(schema.warnings.length).toBeGreaterThan(0);
  });

  it('warns when the top level is not an object', () => {
    const schema = parseJsonSchema('{"type":"string"}');
    expect(schema.warnings.join(' ')).toMatch(/not an object/);
  });

  it('merges allOf subschemas', () => {
    const schema = parseJsonSchema(`{
      "$defs": {
        "Base": { "type": "object", "properties": { "id": { "type": "integer" } }, "required": ["id"] },
        "Thing": {
          "allOf": [{ "$ref": "#/$defs/Base" }, { "type": "object", "properties": { "name": { "type": "string" } } }],
          "type": "object",
          "properties": { "name": { "type": "string" } }
        }
      }
    }`);
    const thing = findEntity(schema, 'Thing')!;
    expect(findField(thing, 'name')).toBeDefined();
  });

  it('is chosen by detectFormat', () => {
    expect(detectFormat(JSON_SCHEMA_SINGLE)).toBe('json-schema');
    expect(parseSchema(JSON_SCHEMA_LIBRARY).format).toBe('json-schema');
  });
});
