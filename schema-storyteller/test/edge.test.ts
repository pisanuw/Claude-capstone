import { describe, it, expect } from 'vitest';
import { detectFormat, parseSchema } from '../src/core/parse/index.js';
import { analyze } from '../src/core/analyze.js';
import { parseSql } from '../src/core/parse/sql.js';
import { findEntity, findField } from '../src/core/types.js';

describe('detectFormat', () => {
  it('defaults to sql for empty or unknown text', () => {
    expect(detectFormat('')).toBe('sql');
    expect(detectFormat('just some prose')).toBe('sql');
  });

  it('treats invalid-JSON-looking text by keyword', () => {
    expect(detectFormat('{ CREATE TABLE t (id int) }')).toBe('sql');
  });

  it('detects a bare model block as prisma', () => {
    expect(detectFormat('model Foo {\n id Int @id\n}')).toBe('prisma');
  });

  it('detects a JSON array as json-schema', () => {
    expect(detectFormat('[]')).toBe('json-schema');
  });

  it('honors an explicit format override', () => {
    expect(parseSchema('CREATE TABLE t (id int);', 'sql').format).toBe('sql');
  });
});

describe('sql edge cases', () => {
  it('parses multiword types and double precision', () => {
    const schema = parseSql(`
      CREATE TABLE t (
        id INT PRIMARY KEY,
        ts TIMESTAMP WITH TIME ZONE,
        ratio DOUBLE PRECISION,
        label CHARACTER VARYING(40)
      );
    `);
    const t = findEntity(schema, 't')!;
    expect(findField(t, 'ts')!.type).toBe('datetime');
    expect(findField(t, 'ratio')!.type).toBe('float');
    expect(findField(t, 'label')!.type).toBe('string');
    expect(findField(t, 'label')!.maxLength).toBe(40);
  });

  it('parses CREATE TABLE AS with no column list', () => {
    const schema = parseSql('CREATE TABLE summary AS SELECT 1;');
    expect(findEntity(schema, 'summary')).toBeDefined();
    expect(findEntity(schema, 'summary')!.fields).toHaveLength(0);
  });

  it('parses a standalone unique CREATE INDEX', () => {
    const schema = parseSql(`
      CREATE TABLE t (id INT PRIMARY KEY, slug TEXT);
      CREATE UNIQUE INDEX uq_slug ON t (slug);
    `);
    expect(schema.indexes.some((i) => i.unique && i.fields.includes('slug'))).toBe(true);
  });

  it('handles ALTER TABLE ADD PRIMARY KEY and ADD UNIQUE', () => {
    const schema = parseSql(`
      CREATE TABLE t (a INT, b INT);
      ALTER TABLE t ADD PRIMARY KEY (a);
      ALTER TABLE t ADD CONSTRAINT uq UNIQUE (b);
    `);
    const t = findEntity(schema, 't')!;
    expect(t.primaryKey).toEqual(['a']);
    expect(t.uniques).toContainEqual(['b']);
  });

  it('marks a single-column UNIQUE column as unique', () => {
    const schema = parseSql('CREATE TABLE t (id INT PRIMARY KEY, code VARCHAR(4), UNIQUE (code));');
    expect(findField(findEntity(schema, 't')!, 'code')!.isUnique).toBe(true);
  });
});

describe('narration of many-to-many and lookup roles', () => {
  it('describes lookup tables and many-to-many links', () => {
    const { narrative, classification } = analyze(`
      CREATE TABLE student (id INT PRIMARY KEY, name TEXT);
      CREATE TABLE course (id INT PRIMARY KEY, title TEXT);
      CREATE TABLE enrollment (
        student_id INT NOT NULL REFERENCES student(id),
        course_id INT NOT NULL REFERENCES course(id),
        PRIMARY KEY (student_id, course_id)
      );
    `);
    expect(classification.roles.get('enrollment')!.isJoinTable).toBe(true);
    const enrollment = narrative.entities.find((e) => e.name === 'enrollment')!;
    expect(enrollment.summary).toMatch(/join table/);
    const student = narrative.entities.find((e) => e.name === 'student')!;
    expect(student.relationshipNotes.join(' ')).toMatch(/can have many/);
  });

  it('narrates an entity with no columns', () => {
    const { narrative } = analyze('CREATE TABLE placeholder ();');
    const p = narrative.entities.find((e) => e.name === 'placeholder')!;
    expect(p.summary).toMatch(/no readable columns/);
  });
});

describe('json schema edge cases', () => {
  it('handles a top-level object with properties but no explicit type', () => {
    const schema = parseSchema('{"properties":{"a":{"type":"string"}}}', 'json-schema');
    expect(schema.entities).toHaveLength(1);
    expect(findField(schema.entities[0], 'a')).toBeDefined();
  });

  it('treats an array-of-$ref property as a relationship', () => {
    const schema = parseSchema(
      `{"$defs":{"Tag":{"type":"object","properties":{"id":{"type":"integer"}}},
        "Post":{"type":"object","required":["tags"],"properties":{"tags":{"type":"array","items":{"$ref":"#/$defs/Tag"}}}}}}`,
      'json-schema',
    );
    expect(schema.relationships.some((r) => r.from === 'Post' && r.to === 'Tag')).toBe(true);
  });
});
