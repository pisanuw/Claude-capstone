import { describe, expect, it } from 'vitest';
import { createStarStore, type KVStorage } from '../src/core/stars';

function memStorage(initial: Record<string, string> = {}): KVStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const KEY = 'summit-navigator:starred:v1';

describe('createStarStore', () => {
  it('starts empty and toggles ids on and off', () => {
    const store = createStarStore(memStorage());
    expect(store.count()).toBe(0);
    expect(store.has('a')).toBe(false);
    expect(store.toggle('a')).toBe(true);
    expect(store.has('a')).toBe(true);
    expect(store.count()).toBe(1);
    expect(store.toggle('a')).toBe(false);
    expect(store.count()).toBe(0);
  });

  it('persists to storage as a JSON array', () => {
    const storage = memStorage();
    const store = createStarStore(storage);
    store.toggle('a');
    store.toggle('b');
    expect(JSON.parse(storage.data[KEY]).sort()).toEqual(['a', 'b']);
    const reloaded = createStarStore(storage);
    expect(reloaded.has('a')).toBe(true);
    expect(reloaded.count()).toBe(2);
  });

  it('exposes the starred set', () => {
    const store = createStarStore(memStorage());
    store.toggle('x');
    expect([...store.all()]).toEqual(['x']);
  });

  it('survives corrupted or wrong-shaped stored values', () => {
    expect(createStarStore(memStorage({ [KEY]: 'not json{' })).count()).toBe(0);
    expect(createStarStore(memStorage({ [KEY]: '{"a":1}' })).count()).toBe(0);
    expect(createStarStore(memStorage({ [KEY]: '["ok", 42]' })).count()).toBe(1);
  });

  it('degrades to memory when storage throws', () => {
    const store = createStarStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(store.toggle('a')).toBe(true);
    expect(store.has('a')).toBe(true);
  });
});
