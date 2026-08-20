import { describe, it, expect } from 'vitest';
import { parseSql } from '../src/core/parse/sql.js';
import { detectFormat, parseSchema } from '../src/core/parse/index.js';
import { findEntity, findField } from '../src/core/types.js';
import { SQL_BLOG, SQL_ALTER } from './fixtures.js';

describe('parseSql', () => {
  it('parses tables, columns and types', () => {
    const schema = parseSql(SQL_BLOG);
    expect(schema.entities.map((e) => e.name).sort()).toEqual(['post_tags', 'posts', 'tags', 'users']);

    const users = findEntity(schema, 'users')!;
    expect(users.primaryKey).toEqual(['id']);
    const email = findField(users, 'email')!;
    expect(email.type).toBe('string');
    expect(email.maxLength).toBe(255);
    expect(email.nullable).toBe(false);
    expect(email.isUnique).toBe(true);
  });

  it('classifies a serial primary key as non-null with a default', () => {
    const schema = parseSql(SQL_BLOG);
    const id = findField(findEntity(schema, 'users')!, 'id')!;
    expect(id.isPrimaryKey).toBe(true);
    expect(id.nullable).toBe(false);
    expect(id.hasDefault).toBe(true);
  });

  it('reads inline and named foreign keys', () => {
    const schema = parseSql(SQL_BLOG);
    const rels = schema.relationships;
    expect(rels).toContainEqual(
      expect.objectContaining({ from: 'posts', to: 'users', fromFields: ['author_id'] }),
    );
    expect(rels.filter((r) => r.from === 'post_tags')).toHaveLength(2);
  });

  it('detects a composite primary key on a join table', () => {
    const schema = parseSql(SQL_BLOG);
    const pt = findEntity(schema, 'post_tags')!;
    expect(pt.primaryKey).toEqual(['post_id', 'tag_id']);
  });

  it('records CREATE INDEX statements', () => {
    const schema = parseSql(SQL_BLOG);
    expect(schema.indexes.some((i) => i.entity === 'posts' && i.fields.includes('author_id'))).toBe(true);
  });

  it('sets FK optionality from the column nullability', () => {
    const schema = parseSql(SQL_BLOG);
    const rel = schema.relationships.find((r) => r.from === 'posts' && r.to === 'users')!;
    expect(rel.optional).toBe(false); // author_id is NOT NULL
  });

  it('handles ALTER TABLE ADD FOREIGN KEY', () => {
    const schema = parseSql(SQL_ALTER);
    const rel = schema.relationships.find((r) => r.from === 'emp' && r.to === 'dept');
    expect(rel).toBeDefined();
    const deptId = findField(findEntity(schema, 'emp')!, 'dept_id')!;
    expect(deptId.references).toEqual({ entity: 'dept', field: 'id' });
    expect(rel!.optional).toBe(true); // dept_id is nullable
  });

  it('warns about a foreign key to an undefined table', () => {
    const schema = parseSql(`
      CREATE TABLE a (id INT PRIMARY KEY, b_id INT REFERENCES missing(id));
    `);
    expect(schema.relationships).toHaveLength(0);
    expect(schema.warnings.join(' ')).toMatch(/missing/);
  });

  it('ignores comments, strings with semicolons, and unrelated statements', () => {
    const schema = parseSql(`
      -- comment; with a semicolon
      CREATE TABLE t (id INT PRIMARY KEY, note TEXT DEFAULT 'a;b');
      INSERT INTO t VALUES (1, 'x');
      /* block; comment */
    `);
    expect(schema.entities).toHaveLength(1);
    const note = findField(findEntity(schema, 't')!, 'note')!;
    expect(note.defaultValue).toContain('a;b');
  });

  it('parses DECIMAL(p,s) without splitting on the inner comma', () => {
    const schema = parseSql(`CREATE TABLE m (id INT PRIMARY KEY, price DECIMAL(10, 2) NOT NULL);`);
    const price = findField(findEntity(schema, 'm')!, 'price')!;
    expect(price.type).toBe('decimal');
    expect(price.nullable).toBe(false);
  });

  it('handles quoted and schema-qualified identifiers', () => {
    const schema = parseSql(`CREATE TABLE public."User Account" ("Full Name" VARCHAR(10));`);
    expect(schema.entities[0].name).toBe('User Account');
    expect(schema.entities[0].fields[0].name).toBe('Full Name');
  });

  it('handles empty and non-table input gracefully', () => {
    expect(parseSql('').entities).toHaveLength(0);
    expect(parseSql('SELECT 1;').entities).toHaveLength(0);
  });

  it('is chosen by detectFormat for DDL', () => {
    expect(detectFormat(SQL_BLOG)).toBe('sql');
    expect(parseSchema(SQL_BLOG).format).toBe('sql');
  });

  it('parses table-level PRIMARY KEY and UNIQUE constraints', () => {
    const schema = parseSql(`
      CREATE TABLE t (
        a INT,
        b INT,
        c INT,
        PRIMARY KEY (a),
        UNIQUE (b, c)
      );
    `);
    const t = findEntity(schema, 't')!;
    expect(t.primaryKey).toEqual(['a']);
    expect(t.uniques).toContainEqual(['b', 'c']);
  });
});
