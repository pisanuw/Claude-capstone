import { describe, expect, it } from 'vitest';
import { Library, normalizeTag, parseTags } from '../src/core/library';
import { MemoryStorage } from './helpers';

const KEY = 'code-analogy-forge:library:v1';

function makeLibrary(): { lib: Library; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  return { lib: new Library(storage), storage };
}

describe('tag helpers', () => {
  it('normalizes tags to lowercase kebab', () => {
    expect(normalizeTag('  CS 1 Lecture  ')).toBe('cs-1-lecture');
    expect(normalizeTag('Recursion')).toBe('recursion');
  });

  it('caps tag length', () => {
    expect(normalizeTag('x'.repeat(100)).length).toBe(24);
  });

  it('parses comma and semicolon separated tags, deduplicated', () => {
    expect(parseTags('cs1, Lecture 3; cs1,, ')).toEqual(['cs1', 'lecture-3']);
  });

  it('caps the number of tags at 8', () => {
    const raw = Array.from({ length: 12 }, (_, i) => `t${String(i)}`).join(',');
    expect(parseTags(raw)).toHaveLength(8);
  });
});

describe('Library', () => {
  it('starts empty', () => {
    const { lib } = makeLibrary();
    expect(lib.list()).toEqual([]);
    expect(lib.allTags()).toEqual([]);
  });

  it('saves and lists entries, newest first', () => {
    const { lib } = makeLibrary();
    lib.save({ analogyId: 'recursion--cooking', audience: 'child', now: new Date('2026-08-25T10:00:00Z') });
    lib.save({ analogyId: 'stack--cooking', audience: 'adult', now: new Date('2026-08-25T11:00:00Z') });
    const all = lib.list();
    expect(all).toHaveLength(2);
    expect(all[0].analogyId).toBe('stack--cooking');
    expect(all[1].conceptId).toBe('recursion');
  });

  it('refuses to save an unknown analogy', () => {
    const { lib } = makeLibrary();
    expect(lib.save({ analogyId: 'nope--nope', audience: 'child' })).toBeNull();
    expect(lib.list()).toEqual([]);
  });

  it('normalizes tags and truncates notes on save', () => {
    const { lib } = makeLibrary();
    const saved = lib.save({
      analogyId: 'queue--travel',
      audience: 'undergrad',
      tags: ['CS 1', '', 'Systems'],
      note: 'n'.repeat(1000),
    });
    expect(saved?.tags).toEqual(['cs-1', 'systems']);
    expect(saved?.note.length).toBe(500);
  });

  it('removes entries by id', () => {
    const { lib } = makeLibrary();
    const saved = lib.save({ analogyId: 'recursion--cooking', audience: 'child' });
    expect(saved).not.toBeNull();
    expect(lib.remove(saved!.id)).toBe(true);
    expect(lib.remove(saved!.id)).toBe(false);
    expect(lib.list()).toEqual([]);
  });

  it('survives corrupt storage', () => {
    const { lib, storage } = makeLibrary();
    storage.setItem(KEY, 'not json at all {');
    expect(lib.list()).toEqual([]);
    storage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(lib.list()).toEqual([]);
  });

  it('filters out entries that fail validation', () => {
    const { lib, storage } = makeLibrary();
    const good = {
      id: 'g',
      analogyId: 'tree--sports',
      conceptId: 'tree',
      audience: 'adult',
      savedAt: '2026-08-25T00:00:00Z',
      tags: ['a'],
      note: '',
    };
    const badAudience = { ...good, id: 'b1', audience: 'wizard' };
    const badAnalogy = { ...good, id: 'b2', analogyId: 'tree--nope' };
    storage.setItem(KEY, JSON.stringify([good, badAudience, badAnalogy, 42, null]));
    expect(lib.list().map((e) => e.id)).toEqual(['g']);
  });

  it('searches across concept name, title, domain, tags, and note', () => {
    const { lib } = makeLibrary();
    lib.save({ analogyId: 'recursion--cooking', audience: 'child', tags: ['cs1'], note: 'for the intro lecture' });
    lib.save({ analogyId: 'queue--travel', audience: 'adult', tags: ['ops'] });
    expect(lib.search('sourdough')).toHaveLength(1);
    expect(lib.search('RECURSION')).toHaveLength(1);
    expect(lib.search('intro lecture')).toHaveLength(1);
    expect(lib.search('travel')).toHaveLength(1);
    expect(lib.search('zzz-nothing')).toHaveLength(0);
    expect(lib.search('')).toHaveLength(2);
  });

  it('filters by tag, combined with search', () => {
    const { lib } = makeLibrary();
    lib.save({ analogyId: 'recursion--cooking', audience: 'child', tags: ['cs1'] });
    lib.save({ analogyId: 'recursion--school', audience: 'child', tags: ['cs2'] });
    expect(lib.search('', 'cs1')).toHaveLength(1);
    expect(lib.search('recursion', 'cs2')).toHaveLength(1);
    expect(lib.search('recursion', 'nope')).toHaveLength(0);
  });

  it('collects all tags alphabetically', () => {
    const { lib } = makeLibrary();
    lib.save({ analogyId: 'recursion--cooking', audience: 'child', tags: ['zeta', 'alpha'] });
    lib.save({ analogyId: 'queue--travel', audience: 'adult', tags: ['midway', 'alpha'] });
    expect(lib.allTags()).toEqual(['alpha', 'midway', 'zeta']);
  });
});
