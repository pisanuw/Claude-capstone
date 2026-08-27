import type { Gene, GeneType, SavedGene } from './types';
import { isGeneType } from './types';

/**
 * The reusable gene library. Backed by localStorage in the app (replacing the
 * idea's implied server store: no accounts, nothing leaves the browser); the
 * storage object and clock are injected so tests can use plain substitutes.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'prompt-genome:library:v1';
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;
const MAX_ENTRIES = 500;

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

function isSavedGene(x: unknown): x is SavedGene {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    isGeneType(o.type) &&
    typeof o.text === 'string' &&
    Array.isArray(o.tags) &&
    o.tags.every((t) => typeof t === 'string') &&
    typeof o.savedAt === 'string'
  );
}

export class GeneLibrary {
  private storage: StorageLike;
  private now: () => string;

  constructor(storage: StorageLike, now: () => string = () => new Date().toISOString()) {
    this.storage = storage;
    this.now = now;
  }

  list(): SavedGene[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedGene);
  }

  private write(entries: SavedGene[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  /** Save a gene; identical (type, text) pairs merge, unioning tags. */
  save(gene: Pick<Gene, 'type' | 'text'>, tags: string[] = []): SavedGene {
    const entries = this.list();
    const normalizedTags = tags.map(normalizeTag).filter((t) => t !== '').slice(0, MAX_TAGS);
    const existing = entries.find(
      (e) => e.type === gene.type && e.text.trim() === gene.text.trim(),
    );
    if (existing) {
      existing.tags = [...new Set([...existing.tags, ...normalizedTags])].slice(0, MAX_TAGS);
      this.write(entries);
      return existing;
    }
    const entry: SavedGene = {
      id: `lib-${entries.length + 1}-${gene.text.length}`,
      type: gene.type,
      text: gene.text.trim(),
      tags: normalizedTags,
      savedAt: this.now(),
    };
    const next = [entry, ...entries].slice(0, MAX_ENTRIES);
    this.write(next);
    return entry;
  }

  remove(id: string): void {
    this.write(this.list().filter((e) => e.id !== id));
  }

  search(query: string, filter: { tag?: string; type?: GeneType } = {}): SavedGene[] {
    const q = query.trim().toLowerCase();
    return this.list().filter((e) => {
      if (filter.tag && !e.tags.includes(filter.tag)) return false;
      if (filter.type && e.type !== filter.type) return false;
      if (q === '') return true;
      return e.text.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q));
    });
  }

  allTags(): string[] {
    const tags = new Set<string>();
    for (const e of this.list()) {
      for (const t of e.tags) tags.add(t);
    }
    return [...tags].sort();
  }
}
