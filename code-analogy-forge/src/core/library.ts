import type { Audience, SavedAnalogy } from './types';
import { AUDIENCES } from './types';
import { getAnalogy } from './corpus/index';

/**
 * The personal analogy library. Backed by localStorage in the app (replacing
 * the idea's suggested Supabase backend: no accounts, nothing leaves the
 * browser); the storage object is injected so tests can use a plain in-memory
 * substitute.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'code-analogy-forge:library:v1';
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;
const MAX_NOTE_LENGTH = 500;

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_TAG_LENGTH);
}

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,;]/)) {
    const tag = normalizeTag(part);
    if (tag !== '') seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

function isSavedAnalogy(x: unknown): x is SavedAnalogy {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.analogyId === 'string' &&
    getAnalogy(o.analogyId) !== undefined &&
    typeof o.conceptId === 'string' &&
    typeof o.audience === 'string' &&
    (AUDIENCES as string[]).includes(o.audience) &&
    typeof o.savedAt === 'string' &&
    Array.isArray(o.tags) &&
    o.tags.every((t) => typeof t === 'string') &&
    typeof o.note === 'string'
  );
}

export class Library {
  constructor(private storage: StorageLike) {}

  /** All saved cards, newest first. Corrupt storage degrades to an empty library. */
  list(): SavedAnalogy[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSavedAnalogy);
    } catch {
      return [];
    }
  }

  save(entry: {
    analogyId: string;
    audience: Audience;
    tags?: string[];
    note?: string;
    now?: Date;
  }): SavedAnalogy | null {
    const found = getAnalogy(entry.analogyId);
    if (!found) return null;
    const savedAt = (entry.now ?? new Date()).toISOString();
    const saved: SavedAnalogy = {
      id: `${entry.analogyId}--${entry.audience}--${savedAt}`,
      analogyId: entry.analogyId,
      conceptId: found.concept.id,
      audience: entry.audience,
      savedAt,
      tags: (entry.tags ?? []).map(normalizeTag).filter((t) => t !== '').slice(0, MAX_TAGS),
      note: (entry.note ?? '').slice(0, MAX_NOTE_LENGTH),
    };
    const all = this.list().filter((e) => e.id !== saved.id);
    all.unshift(saved);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
    return saved;
  }

  remove(id: string): boolean {
    const all = this.list();
    const next = all.filter((e) => e.id !== id);
    if (next.length === all.length) return false;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  }

  /**
   * Case-insensitive search over concept name, analogy title, domain, tags,
   * and note. An empty query returns everything; `tag` additionally filters
   * to cards carrying that exact tag.
   */
  search(query: string, tag?: string): SavedAnalogy[] {
    const q = query.trim().toLowerCase();
    return this.list().filter((e) => {
      if (tag && !e.tags.includes(tag)) return false;
      if (q === '') return true;
      const found = getAnalogy(e.analogyId);
      const haystack = [
        found?.concept.name ?? '',
        found?.analogy.title ?? '',
        found?.analogy.domainLabel ?? '',
        e.tags.join(' '),
        e.note,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  /** Every tag in use, alphabetical. */
  allTags(): string[] {
    const tags = new Set<string>();
    for (const e of this.list()) for (const t of e.tags) tags.add(t);
    return [...tags].sort();
  }
}
