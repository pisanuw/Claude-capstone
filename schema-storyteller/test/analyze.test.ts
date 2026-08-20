import { describe, it, expect } from 'vitest';
import { analyze } from '../src/core/analyze.js';
import { toMarkdown } from '../src/core/markdown.js';
import { classify } from '../src/core/classify.js';
import { parseSql } from '../src/core/parse/sql.js';
import { SQL_BLOG, PRISMA_SHOP, JSON_SCHEMA_LIBRARY, SQL_CRYPTIC, SQL_ALTER } from './fixtures.js';

describe('classify', () => {
  it('identifies a join table', () => {
    const { classification } = analyze(SQL_BLOG);
    expect(classification.roles.get('post_tags')!.isJoinTable).toBe(true);
    expect(classification.roles.get('posts')!.isJoinTable).toBe(false);
  });

  it('identifies a lookup table', () => {
    const { classification } = analyze(SQL_BLOG);
    expect(classification.roles.get('tags')!.isLookupTable).toBe(true);
  });

  it('computes many-to-one for a plain FK and one-to-one for a unique FK', () => {
    const { classification } = analyze(PRISMA_SHOP);
    const orderRel = classification.relationships.find((r) => r.from === 'Order')!;
    expect(orderRel.cardinality).toBe('many-to-one');
    const profileRel = classification.relationships.find((r) => r.from === 'Profile')!;
    expect(profileRel.cardinality).toBe('one-to-one');
  });
});

describe('narrate', () => {
  it('produces an overview mentioning entity and relationship counts', () => {
    const { narrative } = analyze(SQL_BLOG);
    expect(narrative.overview).toMatch(/4 entities/);
    expect(narrative.overview).toMatch(/join table/i);
  });

  it('describes each entity with a summary and field notes', () => {
    const { narrative } = analyze(SQL_BLOG);
    const posts = narrative.entities.find((e) => e.name === 'posts')!;
    expect(posts.summary).toMatch(/Each row represents one post/);
    expect(posts.relationshipNotes.join(' ')).toMatch(/belongs to a user/);
    expect(posts.fieldNotes.some((n) => n.includes('author_id'))).toBe(true);
  });

  it('narrates the join table as linking its targets', () => {
    const { narrative } = analyze(SQL_BLOG);
    const pt = narrative.entities.find((e) => e.name === 'post_tags')!;
    expect(pt.summary).toMatch(/join table/);
  });

  it('handles empty input', () => {
    const { narrative } = analyze('');
    expect(narrative.overview).toMatch(/No tables/);
    expect(narrative.entities).toHaveLength(0);
  });
});

describe('lint', () => {
  it('flags a table with no primary key', () => {
    const { findings } = analyze('CREATE TABLE t (a INT, b INT);');
    expect(findings.some((f) => f.rule === 'missing-primary-key')).toBe(true);
  });

  it('flags an unindexed foreign key', () => {
    // emp.dept_id FK has no index in SQL_ALTER.
    const { findings } = analyze(SQL_ALTER);
    expect(findings.some((f) => f.rule === 'unindexed-foreign-key' && f.entity === 'emp')).toBe(true);
  });

  it('does not flag an indexed foreign key', () => {
    // posts.author_id is indexed by idx_posts_author in SQL_BLOG.
    const { findings } = analyze(SQL_BLOG);
    const postAuthor = findings.find(
      (f) => f.rule === 'unindexed-foreign-key' && f.entity === 'posts',
    );
    expect(postAuthor).toBeUndefined();
  });

  it('flags an implied foreign key with no constraint', () => {
    const { findings } = analyze(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE posts (id INT PRIMARY KEY, user_id INT);
    `);
    expect(findings.some((f) => f.rule === 'implied-foreign-key' && f.field === 'user_id')).toBe(true);
  });

  it('flags a nullable boolean and a temporal-named non-date column', () => {
    const { findings } = analyze(SQL_BLOG);
    expect(findings.some((f) => f.rule === 'nullable-boolean' && f.field === 'is_active')).toBe(true);
    expect(findings.some((f) => f.rule === 'temporal-name-wrong-type' && f.field === 'published_on')).toBe(true);
  });

  it('suggests renames for cryptic names', () => {
    const { findings } = analyze(SQL_CRYPTIC);
    expect(findings.some((f) => f.rule === 'cryptic-table-name')).toBe(true);
    expect(findings.some((f) => f.rule === 'cryptic-name')).toBe(true);
  });

  it('orders findings with high severity first', () => {
    const { findings } = analyze(`CREATE TABLE t (a INT, note TEXT);`);
    const severities = findings.map((f) => f.severity);
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(order[severities[i - 1]]).toBeLessThanOrEqual(order[severities[i]]);
    }
  });

  it('does not flag join-table FKs as missing audit columns', () => {
    const { findings } = analyze(SQL_BLOG);
    expect(findings.some((f) => f.rule === 'missing-audit-columns' && f.entity === 'post_tags')).toBe(false);
  });
});

describe('toMarkdown', () => {
  it('renders overview, entities and findings sections', () => {
    const md = toMarkdown(analyze(SQL_BLOG), 'Blog');
    expect(md).toMatch(/^# Blog/);
    expect(md).toMatch(/## Overview/);
    expect(md).toMatch(/## Entities/);
    expect(md).toMatch(/### posts/);
    expect(md).toMatch(/## Review findings/);
    expect(md).toMatch(/\| Severity \| Location \| Finding \|/);
  });

  it('escapes pipes in messages and notes a clean schema', () => {
    const md = toMarkdown(analyze(JSON_SCHEMA_LIBRARY));
    expect(md).toContain('JSON Schema');
    expect(md).not.toMatch(/\n\|[^|]*\n\|[^-]/); // no broken table rows
  });

  it('lists parser warnings when present', () => {
    const analysis = analyze('CREATE TABLE a (id INT PRIMARY KEY, x INT REFERENCES nope(id));');
    const md = toMarkdown(analysis);
    expect(md).toMatch(/## Parser notes/);
  });
});

describe('classify direct', () => {
  it('is callable on a bare parsed schema', () => {
    const c = classify(parseSql(SQL_BLOG));
    expect(c.roles.size).toBe(4);
  });
});
