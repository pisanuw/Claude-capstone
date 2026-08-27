import { describe, expect, it } from 'vitest';
import { GeneLibrary, normalizeTag, parseTags, type StorageLike } from '../src/core/library';

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const fixedNow = () => '2026-08-27T00:00:00.000Z';

describe('normalizeTag / parseTags', () => {
  it('lowercases, hyphenates, and truncates', () => {
    expect(normalizeTag('  Code Review  ')).toBe('code-review');
    expect(normalizeTag('x'.repeat(40)).length).toBe(24);
  });

  it('splits on commas and semicolons, dedupes, and caps at 8', () => {
    expect(parseTags('a, b; a,  ,c')).toEqual(['a', 'b', 'c']);
    expect(parseTags('1,2,3,4,5,6,7,8,9,10')).toHaveLength(8);
  });
});

describe('GeneLibrary', () => {
  it('starts empty and saves genes newest-first', () => {
    const lib = new GeneLibrary(memoryStorage(), fixedNow);
    expect(lib.list()).toEqual([]);
    lib.save({ type: 'role', text: 'You are a coach.' }, ['sport']);
    lib.save({ type: 'task', text: 'Plan a workout.' });
    const entries = lib.list();
    expect(entries.map((e) => e.type)).toEqual(['task', 'role']);
    expect(entries[1].tags).toEqual(['sport']);
    expect(entries[0].savedAt).toBe(fixedNow());
  });

  it('merges duplicate saves and unions tags', () => {
    const lib = new GeneLibrary(memoryStorage(), fixedNow);
    lib.save({ type: 'role', text: 'You are a coach.' }, ['sport']);
    lib.save({ type: 'role', text: '  You are a coach.  ' }, ['fitness']);
    const entries = lib.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].tags.sort()).toEqual(['fitness', 'sport']);
  });

  it('removes by id', () => {
    const lib = new GeneLibrary(memoryStorage(), fixedNow);
    const saved = lib.save({ type: 'task', text: 'Plan a workout.' });
    lib.remove(saved.id);
    expect(lib.list()).toEqual([]);
  });

  it('searches text and tags, with tag and type filters', () => {
    const lib = new GeneLibrary(memoryStorage(), fixedNow);
    lib.save({ type: 'constraint', text: 'No jargon.' }, ['style']);
    lib.save({ type: 'task', text: 'Summarize the paper.' }, ['research']);
    expect(lib.search('jargon')).toHaveLength(1);
    expect(lib.search('', { tag: 'research' })[0].type).toBe('task');
    expect(lib.search('', { type: 'constraint' })).toHaveLength(1);
    expect(lib.search('resea')).toHaveLength(1); // tag substring
    expect(lib.search('zzz')).toEqual([]);
  });

  it('lists all tags sorted', () => {
    const lib = new GeneLibrary(memoryStorage(), fixedNow);
    lib.save({ type: 'task', text: 'a' }, ['zeta', 'alpha']);
    lib.save({ type: 'task', text: 'b' }, ['alpha']);
    expect(lib.allTags()).toEqual(['alpha', 'zeta']);
  });

  it('survives corrupted storage', () => {
    const key = 'prompt-genome:library:v1';
    expect(new GeneLibrary(memoryStorage({ [key]: 'not json' }), fixedNow).list()).toEqual([]);
    expect(new GeneLibrary(memoryStorage({ [key]: '{"a":1}' }), fixedNow).list()).toEqual([]);
    const half = JSON.stringify([{ id: 'x' }, { id: 'ok', type: 'task', text: 't', tags: [], savedAt: 'now' }]);
    expect(new GeneLibrary(memoryStorage({ [key]: half }), fixedNow).list()).toHaveLength(1);
  });
});
