/** The subset of the Storage interface the star store needs (injectable for tests). */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'summit-navigator:starred:v1';

export interface StarStore {
  has(id: string): boolean;
  toggle(id: string): boolean;
  all(): ReadonlySet<string>;
  count(): number;
}

/**
 * Starred-session store persisted as a JSON array. Storage failures (private
 * browsing, quota) degrade to in-memory state instead of throwing.
 */
export function createStarStore(storage: KVStorage): StarStore {
  let ids = new Set<string>();
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        ids = new Set(parsed.filter((x): x is string => typeof x === 'string'));
      }
    }
  } catch {
    ids = new Set();
  }

  function persist(): void {
    try {
      storage.setItem(KEY, JSON.stringify([...ids]));
    } catch {
      // In-memory only; stars survive the page session but not a reload.
    }
  }

  return {
    has: (id) => ids.has(id),
    toggle(id) {
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      persist();
      return ids.has(id);
    },
    all: () => ids,
    count: () => ids.size,
  };
}
