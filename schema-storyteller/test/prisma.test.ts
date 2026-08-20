import { describe, it, expect } from 'vitest';
import { parsePrisma } from '../src/core/parse/prisma.js';
import { detectFormat, parseSchema } from '../src/core/parse/index.js';
import { findEntity, findField } from '../src/core/types.js';
import { PRISMA_SHOP } from './fixtures.js';

describe('parsePrisma', () => {
  it('parses models and scalar fields', () => {
    const schema = parsePrisma(PRISMA_SHOP);
    expect(schema.entities.map((e) => e.name).sort()).toEqual(['Order', 'Profile', 'User']);
    const user = findEntity(schema, 'User')!;
    expect(findField(user, 'id')!.isPrimaryKey).toBe(true);
    expect(findField(user, 'email')!.isUnique).toBe(true);
  });

  it('maps enum-typed fields with their values', () => {
    const schema = parsePrisma(PRISMA_SHOP);
    const role = findField(findEntity(schema, 'User')!, 'role')!;
    expect(role.type).toBe('enum');
    expect(role.enumValues).toEqual(['ADMIN', 'CUSTOMER']);
    expect(role.hasDefault).toBe(true);
  });

  it('records a relationship from the FK-owning side', () => {
    const schema = parsePrisma(PRISMA_SHOP);
    const rel = schema.relationships.find((r) => r.from === 'Order' && r.to === 'User');
    expect(rel).toBeDefined();
    expect(rel!.fromFields).toEqual(['userId']);
    const fk = findField(findEntity(schema, 'Order')!, 'userId')!;
    expect(fk.references).toEqual({ entity: 'User', field: 'id' });
  });

  it('does not double-count the back-reference (User.orders) as a relationship', () => {
    const schema = parsePrisma(PRISMA_SHOP);
    expect(schema.relationships.filter((r) => r.to === 'User')).toHaveLength(2); // Order, Profile
    expect(schema.relationships.some((r) => r.from === 'User')).toBe(false);
  });

  it('treats an optional scalar as nullable and a unique FK as one-to-one input', () => {
    const schema = parsePrisma(PRISMA_SHOP);
    const bio = findField(findEntity(schema, 'Profile')!, 'bio')!;
    expect(bio.nullable).toBe(true);
    const userId = findField(findEntity(schema, 'Profile')!, 'userId')!;
    expect(userId.isUnique).toBe(true);
  });

  it('handles @@id and @@unique block attributes', () => {
    const schema = parsePrisma(`
      model Membership {
        userId  Int
        groupId Int
        role    String
        @@id([userId, groupId])
        @@unique([userId, role])
      }
    `);
    const m = findEntity(schema, 'Membership')!;
    expect(m.primaryKey).toEqual(['userId', 'groupId']);
    expect(m.uniques).toContainEqual(['userId', 'role']);
  });

  it('ignores comments and list fields for nullability', () => {
    const schema = parsePrisma(`
      model A {
        id    Int      @id
        // a comment line
        tags  String[] // inline comment
      }
    `);
    const tags = findField(findEntity(schema, 'A')!, 'tags')!;
    expect(tags.isArray).toBe(true);
    expect(tags.nullable).toBe(false);
  });

  it('is chosen by detectFormat', () => {
    expect(detectFormat(PRISMA_SHOP)).toBe('prisma');
    expect(parseSchema(PRISMA_SHOP).format).toBe('prisma');
  });
});
