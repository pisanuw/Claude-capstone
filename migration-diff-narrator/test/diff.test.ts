import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze.js';
import { levenshtein } from '../src/core/diff.js';
import type { Change, ChangeKind } from '../src/core/types.js';

function sqlDiff(before: string, after: string): Change[] {
  return analyze(before, after, 'sql').result.changes;
}

function tsDiff(before: string, after: string): Change[] {
  return analyze(before, after, 'typescript').result.changes;
}

function byKind(changes: Change[], kind: ChangeKind): Change[] {
  return changes.filter((c) => c.kind === kind);
}

describe('diffModels — entities', () => {
  it('reports added and removed tables', () => {
    const changes = sqlDiff(
      `CREATE TABLE a (id INT); CREATE TABLE b (id INT);`,
      `CREATE TABLE a (id INT); CREATE TABLE c (id INT, extra TEXT);`,
    );
    const removed = byKind(changes, 'entity-removed');
    const added = byKind(changes, 'entity-added');
    expect(removed).toHaveLength(1);
    expect(removed[0].entity).toBe('b');
    expect(removed[0].severity).toBe('breaking');
    expect(added).toHaveLength(1);
    expect(added[0].entity).toBe('c');
    expect(added[0].severity).toBe('safe');
  });

  it('detects a table rename by column overlap and still diffs its columns', () => {
    const changes = sqlDiff(
      `CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(100), name TEXT);`,
      `CREATE TABLE accounts (id INT PRIMARY KEY, email VARCHAR(200), name TEXT);`,
    );
    const renamed = byKind(changes, 'entity-renamed');
    expect(renamed).toHaveLength(1);
    expect(renamed[0].before).toBe('users');
    expect(renamed[0].after).toBe('accounts');
    expect(renamed[0].severity).toBe('caution');
    // The rename pair is still compared column by column.
    const typeChanges = byKind(changes, 'type-changed');
    expect(typeChanges).toHaveLength(1);
    expect(typeChanges[0].summary).toContain('VARCHAR(100) -> VARCHAR(200)');
    expect(byKind(changes, 'entity-removed')).toHaveLength(0);
  });

  it('does not call two unrelated tables a rename', () => {
    const changes = sqlDiff(
      `CREATE TABLE users (id INT, email TEXT);`,
      `CREATE TABLE products (sku TEXT, price DECIMAL(8,2));`,
    );
    expect(byKind(changes, 'entity-renamed')).toHaveLength(0);
    expect(byKind(changes, 'entity-removed')).toHaveLength(1);
    expect(byKind(changes, 'entity-added')).toHaveLength(1);
  });
});

describe('diffModels — columns (SQL)', () => {
  it('classifies added columns by nullability and default', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT);`,
      `CREATE TABLE t (id INT, a TEXT, b TEXT NOT NULL, c TEXT NOT NULL DEFAULT 'x');`,
    );
    const added = byKind(changes, 'column-added');
    expect(added.map((c) => [c.column, c.severity])).toEqual([
      ['a', 'safe'],
      ['b', 'breaking'],
      ['c', 'caution'],
    ]);
  });

  it('reports removed columns as breaking', () => {
    const changes = sqlDiff(`CREATE TABLE t (id INT, gone TEXT);`, `CREATE TABLE t (id INT);`);
    const removed = byKind(changes, 'column-removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].column).toBe('gone');
    expect(removed[0].severity).toBe('breaking');
  });

  it('detects a column rename by similar name', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT, user_name TEXT);`,
      `CREATE TABLE t (id INT, username TEXT);`,
    );
    const renamed = byKind(changes, 'column-renamed');
    expect(renamed).toHaveLength(1);
    expect(renamed[0].before).toBe('user_name');
    expect(renamed[0].after).toBe('username');
    expect(byKind(changes, 'column-removed')).toHaveLength(0);
    expect(byKind(changes, 'column-added')).toHaveLength(0);
  });

  it('detects a column rename by position and identical type', () => {
    const changes = sqlDiff(
      `CREATE TABLE orders (id INT, status VARCHAR(20));`,
      `CREATE TABLE orders (id INT, state VARCHAR(20));`,
    );
    const renamed = byKind(changes, 'column-renamed');
    expect(renamed).toHaveLength(1);
    expect(renamed[0].summary).toContain('status renamed to state');
  });

  it('treats different-type add+remove as separate changes, not a rename', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT, price DECIMAL(8,2));`,
      `CREATE TABLE t (id INT, category TEXT);`,
    );
    expect(byKind(changes, 'column-renamed')).toHaveLength(0);
    expect(byKind(changes, 'column-removed')).toHaveLength(1);
    expect(byKind(changes, 'column-added')).toHaveLength(1);
  });

  it('classifies NOT NULL tightening and loosening', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (a TEXT, b TEXT NOT NULL, c TEXT DEFAULT 'x');`,
      `CREATE TABLE t (a TEXT NOT NULL, b TEXT, c TEXT NOT NULL DEFAULT 'x');`,
    );
    const nullability = byKind(changes, 'nullability-changed');
    const a = nullability.find((c) => c.column === 'a')!;
    const b = nullability.find((c) => c.column === 'b')!;
    const c = nullability.find((c) => c.column === 'c')!;
    expect(a.severity).toBe('breaking'); // tightened without default
    expect(b.severity).toBe('safe'); // loosened
    expect(c.severity).toBe('caution'); // tightened but has a default
  });

  it('reports default add / change / removal with severity tied to nullability', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (a INT, b INT DEFAULT 1, c INT NOT NULL DEFAULT 2, d INT DEFAULT 9);`,
      `CREATE TABLE t (a INT DEFAULT 5, b INT DEFAULT 2, c INT NOT NULL, d INT);`,
    );
    const defaults = byKind(changes, 'default-changed');
    expect(defaults.find((x) => x.column === 'a')!.severity).toBe('safe');
    expect(defaults.find((x) => x.column === 'b')!.severity).toBe('safe');
    expect(defaults.find((x) => x.column === 'c')!.severity).toBe('breaking');
    expect(defaults.find((x) => x.column === 'd')!.severity).toBe('caution');
  });

  it('flags primary key changes as breaking', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT PRIMARY KEY, code TEXT);`,
      `CREATE TABLE t (id INT, code TEXT, PRIMARY KEY (code));`,
    );
    const pk = byKind(changes, 'primary-key-changed');
    expect(pk).toHaveLength(1);
    expect(pk[0].severity).toBe('breaking');
    expect(pk[0].before).toBe('id');
    expect(pk[0].after).toBe('code');
  });

  it('reports unique constraints from columns, table constraints and unique indexes', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (email TEXT UNIQUE, a INT, b INT, UNIQUE (a, b));`,
      `CREATE TABLE t (email TEXT, a INT, b INT);
       CREATE UNIQUE INDEX ux ON t (b);`,
    );
    const uniques = byKind(changes, 'unique-changed');
    const added = uniques.filter((u) => u.after !== undefined);
    const removed = uniques.filter((u) => u.before !== undefined);
    expect(added.map((u) => u.after)).toEqual(['b']);
    expect(removed.map((u) => u.before).sort()).toEqual(['a,b', 'email']);
  });

  it('reports index add and removal', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (a INT, b INT); CREATE INDEX i1 ON t (a);`,
      `CREATE TABLE t (a INT, b INT); CREATE INDEX i2 ON t (b);`,
    );
    expect(byKind(changes, 'index-added')).toHaveLength(1);
    expect(byKind(changes, 'index-removed')).toHaveLength(1);
    expect(byKind(changes, 'index-added')[0].severity).toBe('safe');
    expect(byKind(changes, 'index-removed')[0].severity).toBe('caution');
  });

  it('reports foreign key add and removal including inline REFERENCES', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (user_id INT REFERENCES users (id), g INT);`,
      `CREATE TABLE t (user_id INT, g INT REFERENCES groups (id));`,
    );
    const fkAdded = byKind(changes, 'foreign-key-added');
    const fkRemoved = byKind(changes, 'foreign-key-removed');
    expect(fkAdded).toHaveLength(1);
    expect(fkAdded[0].after).toContain('groups');
    expect(fkRemoved).toHaveLength(1);
    expect(fkRemoved[0].before).toContain('users');
  });

  it('flags auto-increment changes', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT PRIMARY KEY);`,
      `CREATE TABLE t (id SERIAL PRIMARY KEY);`,
    );
    const auto = byKind(changes, 'auto-increment-changed');
    expect(auto).toHaveLength(1);
    expect(auto[0].severity).toBe('caution');
  });

  it('returns no changes for identical schemas modulo case and whitespace', () => {
    const changes = sqlDiff(
      `CREATE TABLE t (id INT NOT NULL, name VARCHAR(10));`,
      `create table T (ID int not null, NAME varchar(10));`,
    );
    expect(changes).toHaveLength(0);
  });
});

describe('diffModels — TypeScript phrasing', () => {
  it('classifies added fields by optionality', () => {
    const changes = tsDiff(
      `interface T { id: number }`,
      `interface T { id: number; a?: string; b: string }`,
    );
    const added = byKind(changes, 'column-added');
    expect(added.find((c) => c.column === 'a')!.severity).toBe('safe');
    expect(added.find((c) => c.column === 'b')!.severity).toBe('breaking');
  });

  it('treats optionality changes as caution in both directions', () => {
    const changes = tsDiff(
      `interface T { a?: string; b: string }`,
      `interface T { a: string; b?: string }`,
    );
    const nullability = byKind(changes, 'nullability-changed');
    expect(nullability).toHaveLength(2);
    expect(nullability.every((c) => c.severity === 'caution')).toBe(true);
  });

  it('reports readonly tightening as caution and loosening as safe', () => {
    const changes = tsDiff(
      `interface T { a: string; readonly b: string }`,
      `interface T { readonly a: string; b: string }`,
    );
    const ro = byKind(changes, 'readonly-changed');
    expect(ro.find((c) => c.column === 'a')!.severity).toBe('caution');
    expect(ro.find((c) => c.column === 'b')!.severity).toBe('safe');
  });

  it('uses Type/Field wording for TypeScript inputs', () => {
    const changes = tsDiff(`interface Gone { x: number }`, ``);
    expect(changes[0].summary).toBe('Type Gone removed');
  });
});

describe('levenshtein', () => {
  it('computes edit distances', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', 'abd')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'ab')).toBe(2);
  });
});
