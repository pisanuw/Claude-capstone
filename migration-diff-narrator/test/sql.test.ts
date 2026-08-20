import { describe, expect, it } from 'vitest';
import { parseSql } from '../src/core/parse/sql.js';

describe('parseSql', () => {
  it('parses a basic CREATE TABLE with column attributes', () => {
    const model = parseSql(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(120) NOT NULL UNIQUE,
        bio TEXT,
        age INT DEFAULT 0
      );
    `);
    expect(model.entities).toHaveLength(1);
    const [users] = model.entities;
    expect(users.name).toBe('users');
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'email', 'bio', 'age']);

    const id = users.columns[0];
    expect(id.isPrimaryKey).toBe(true);
    expect(id.nullable).toBe(false);
    expect(id.autoIncrement).toBe(true);
    expect(id.family).toBe('integer');

    const email = users.columns[1];
    expect(email.nullable).toBe(false);
    expect(email.isUnique).toBe(true);
    expect(email.maxLength).toBe(120);
    expect(email.family).toBe('string');

    const age = users.columns[3];
    expect(age.hasDefault).toBe(true);
    expect(age.defaultValue).toBe('0');
  });

  it('reads decimal precision and scale', () => {
    const model = parseSql(`CREATE TABLE t (total DECIMAL(10, 2) NOT NULL);`);
    const col = model.entities[0].columns[0];
    expect(col.family).toBe('decimal');
    expect(col.maxLength).toBe(10);
    expect(col.scale).toBe(2);
  });

  it('handles quoted and schema-qualified identifiers', () => {
    const model = parseSql(`CREATE TABLE public."User Account" ("Full Name" varchar(40));`);
    expect(model.entities[0].name).toBe('User Account');
    expect(model.entities[0].columns[0].name).toBe('Full Name');
  });

  it('parses table-level constraints', () => {
    const model = parseSql(`
      CREATE TABLE order_items (
        order_id BIGINT,
        sku VARCHAR(40),
        qty INT,
        PRIMARY KEY (order_id, sku),
        UNIQUE (sku),
        FOREIGN KEY (order_id) REFERENCES orders (id)
      );
    `);
    const [t] = model.entities;
    expect(t.primaryKey).toEqual(['order_id', 'sku']);
    expect(t.uniques).toEqual([['sku']]);
    expect(t.foreignKeys).toEqual([{ columns: ['order_id'], refEntity: 'orders', refColumns: ['id'] }]);
    // PK membership implies NOT NULL.
    expect(t.columns[0].nullable).toBe(false);
    expect(t.columns[1].isPrimaryKey).toBe(true);
  });

  it('attaches CREATE INDEX to the right entity', () => {
    const model = parseSql(`
      CREATE TABLE users (id INT);
      CREATE INDEX idx_users_id ON users (id);
      CREATE UNIQUE INDEX idx_u ON users (id, name);
    `);
    const [users] = model.entities;
    expect(users.indexes).toHaveLength(2);
    expect(users.indexes[0]).toMatchObject({ name: 'idx_users_id', columns: ['id'], unique: false });
    expect(users.indexes[1]).toMatchObject({ columns: ['id', 'name'], unique: true });
  });

  it('applies ALTER TABLE ADD/DROP COLUMN and ADD CONSTRAINT', () => {
    const model = parseSql(`
      CREATE TABLE t (a INT, b INT);
      ALTER TABLE t ADD COLUMN c VARCHAR(10) NOT NULL DEFAULT 'x';
      ALTER TABLE t DROP COLUMN b;
      ALTER TABLE t ADD CONSTRAINT t_pk PRIMARY KEY (a);
      ALTER TABLE t ADD CONSTRAINT fk FOREIGN KEY (c) REFERENCES other (id);
      ALTER TABLE t ADD UNIQUE (c);
    `);
    const [t] = model.entities;
    expect(t.columns.map((c) => c.name)).toEqual(['a', 'c']);
    expect(t.columns[1].defaultValue).toBe("'x'");
    expect(t.primaryKey).toEqual(['a']);
    expect(t.foreignKeys[0].refEntity).toBe('other');
    expect(t.uniques).toEqual([['c']]);
  });

  it('resolves Postgres CREATE TYPE ... AS ENUM columns', () => {
    const model = parseSql(`
      CREATE TYPE mood AS ENUM ('happy', 'sad');
      CREATE TABLE t (feeling mood NOT NULL);
    `);
    const col = model.entities[0].columns[0];
    expect(col.family).toBe('enum');
    expect(col.members).toEqual(['happy', 'sad']);
  });

  it('reads MySQL inline ENUM members and in-table KEY', () => {
    const model = parseSql(`
      CREATE TABLE t (
        status ENUM('a', 'b') NOT NULL,
        x INT,
        KEY idx_x (x)
      );
    `);
    const [t] = model.entities;
    expect(t.columns[0].members).toEqual(['a', 'b']);
    expect(t.indexes).toEqual([{ columns: ['x'], unique: false }]);
  });

  it('ignores comments, INSERTs and other statements', () => {
    const model = parseSql(`
      -- a comment with CREATE TABLE fake (x INT);
      /* another CREATE TABLE fake2 (y INT); */
      INSERT INTO t VALUES (1);
      CREATE VIEW v AS SELECT 1;
      CREATE TABLE real_table (id INT);
    `);
    expect(model.entities.map((e) => e.name)).toEqual(['real_table']);
  });

  it('records a warning for CREATE TABLE AS SELECT', () => {
    const model = parseSql(`CREATE TABLE snapshot AS SELECT * FROM t`);
    expect(model.entities[0].columns).toHaveLength(0);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it('handles multiword types with length tails', () => {
    const model = parseSql(`CREATE TABLE t (name CHARACTER VARYING(40), at TIMESTAMP WITH TIME ZONE);`);
    const [t] = model.entities;
    expect(t.columns[0].family).toBe('string');
    expect(t.columns[0].maxLength).toBe(40);
    expect(t.columns[1].family).toBe('datetime');
  });

  it('captures inline REFERENCES', () => {
    const model = parseSql(`CREATE TABLE orders (user_id INT REFERENCES users (id));`);
    expect(model.entities[0].columns[0].references).toEqual({ entity: 'users', column: 'id' });
  });
});
