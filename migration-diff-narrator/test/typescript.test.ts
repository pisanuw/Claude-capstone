import { describe, expect, it } from 'vitest';
import { parseTypescript, splitNullability, tsFamily } from '../src/core/parse/typescript.js';

describe('parseTypescript', () => {
  it('parses an interface with optional, readonly and typed members', () => {
    const model = parseTypescript(`
      export interface User {
        readonly id: number;
        email: string;
        name?: string;
        createdAt: Date;
      }
    `);
    expect(model.entities).toHaveLength(1);
    const [user] = model.entities;
    expect(user.name).toBe('User');
    expect(user.columns.map((c) => c.name)).toEqual(['id', 'email', 'name', 'createdAt']);
    expect(user.columns[0].readonly).toBe(true);
    expect(user.columns[0].family).toBe('float');
    expect(user.columns[1].nullable).toBe(false);
    expect(user.columns[2].nullable).toBe(true);
    expect(user.columns[3].family).toBe('datetime');
  });

  it('parses type aliases with object shapes', () => {
    const model = parseTypescript(`type Point = { x: number, y: number }`);
    expect(model.entities[0].name).toBe('Point');
    expect(model.entities[0].columns).toHaveLength(2);
  });

  it('skips non-object type aliases with a warning', () => {
    const model = parseTypescript(`type Id = string | number;`);
    expect(model.entities).toHaveLength(0);
    expect(model.warnings.some((w) => w.includes('Id'))).toBe(true);
  });

  it('treats null/undefined unions as nullable', () => {
    const model = parseTypescript(`interface T { a: string | null; b: number | undefined; c: string }`);
    const [t] = model.entities;
    expect(t.columns[0].nullable).toBe(true);
    expect(t.columns[1].nullable).toBe(true);
    expect(t.columns[2].nullable).toBe(false);
  });

  it('classifies string literal unions as enums with members', () => {
    const model = parseTypescript(`interface T { role: 'admin' | 'member' | 'guest' }`);
    const col = model.entities[0].columns[0];
    expect(col.family).toBe('enum');
    expect(col.members).toEqual(['admin', 'member', 'guest']);
  });

  it('handles multi-line union types', () => {
    const model = parseTypescript(`
      interface T {
        status:
          | 'a'
          | 'b';
        next: string;
      }
    `);
    const [t] = model.entities;
    expect(t.columns).toHaveLength(2);
    expect(t.columns[0].members).toEqual(['a', 'b']);
  });

  it('inherits members through extends when the parent is declared', () => {
    const model = parseTypescript(`
      interface Base { id: number; createdAt: Date }
      interface User extends Base { email: string; id: string }
    `);
    const user = model.entities.find((e) => e.name === 'User')!;
    expect(user.columns.map((c) => c.name).sort()).toEqual(['createdAt', 'email', 'id']);
    // The child's own `id` wins over the parent's.
    expect(user.columns.find((c) => c.name === 'id')!.rawType).toBe('string');
  });

  it('warns when extending an undeclared parent', () => {
    const model = parseTypescript(`interface A extends External { x: number }`);
    expect(model.warnings.some((w) => w.includes('External'))).toBe(true);
    expect(model.entities[0].columns).toHaveLength(1);
  });

  it('skips methods and index signatures with warnings', () => {
    const model = parseTypescript(`
      interface T {
        [key: string]: unknown;
        save(): void;
        data: string;
      }
    `);
    const [t] = model.entities;
    expect(t.columns.map((c) => c.name)).toEqual(['data']);
    expect(model.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores comments, including ones containing braces', () => {
    const model = parseTypescript(`
      // interface Fake { x: number }
      /* type Fake2 = { y: string } */
      interface Real { z: boolean }
    `);
    expect(model.entities.map((e) => e.name)).toEqual(['Real']);
  });

  it('handles nested object literal members', () => {
    const model = parseTypescript(`interface T { meta: { a: string; b: number }; tail: string }`);
    const [t] = model.entities;
    expect(t.columns.map((c) => c.name)).toEqual(['meta', 'tail']);
    expect(t.columns[0].family).toBe('object');
  });
});

describe('tsFamily', () => {
  it('maps primitives and containers', () => {
    expect(tsFamily('string')).toBe('string');
    expect(tsFamily('number')).toBe('float');
    expect(tsFamily('bigint')).toBe('integer');
    expect(tsFamily('boolean')).toBe('boolean');
    expect(tsFamily('Date')).toBe('datetime');
    expect(tsFamily('string[]')).toBe('array');
    expect(tsFamily('Array<number>')).toBe('array');
    expect(tsFamily('Record<string, number>')).toBe('object');
    expect(tsFamily('{ a: 1 }')).toBe('object');
    expect(tsFamily("'lit'")).toBe('literal');
    expect(tsFamily('Buffer')).toBe('binary');
    expect(tsFamily('SomeClass')).toBe('unknown');
    expect(tsFamily('string | number')).toBe('unknown');
  });
});

describe('splitNullability', () => {
  it('strips null and undefined and reports them', () => {
    expect(splitNullability('string | null')).toEqual({ core: 'string', nullable: true });
    expect(splitNullability('string | number | undefined')).toEqual({
      core: 'string | number',
      nullable: true,
    });
    expect(splitNullability('string')).toEqual({ core: 'string', nullable: false });
  });
});
