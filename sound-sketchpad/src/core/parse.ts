/**
 * Turns a plain-English description into a SoundSpec plus an explanation of
 * exactly which words were recognized, so the result is never a black box.
 */

import type { SoundSpec } from './spec.js';
import { lookupBase, lookupModifier } from './lexicon.js';
import { hashString } from './rng.js';

export interface ParseResult {
  spec: SoundSpec;
  /** id of the base sound that was chosen. */
  baseId: string;
  /** The word in the description that selected the base sound, if any. */
  baseWord: string | null;
  /** Base-sound words that matched but were not chosen (first match wins). */
  ignoredBases: string[];
  /** Modifiers applied, in the order they appeared. */
  modifiers: { id: string; word: string; describe: string }[];
  /** True when no base-sound word was found and the generic fallback ran. */
  fallback: boolean;
  /** Seed derived from the normalized description (drives noise layers). */
  seed: number;
}

/** Lowercase, strip punctuation, split, and merge common two-word forms. */
export function tokenize(description: string): string[] {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, '')
    .split(/\s+/)
    .filter(Boolean);

  // Merge "power up" -> "powerup", "level up" -> "levelup", "8 bit" -> "8bit",
  // "video game" -> "videogame", "foot step(s)" -> "footstep(s)".
  const merged: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = words[i] + words[i + 1];
    if (['powerup', 'levelup', '8bit', 'videogame', 'footstep', 'footsteps'].includes(pair)) {
      merged.push(pair);
      i++;
    } else {
      merged.push(words[i]);
    }
  }
  return merged;
}

const FALLBACK_BASE_ID = 'whoosh';

export function parseDescription(description: string): ParseResult {
  const tokens = tokenize(description);
  const seed = hashString(tokens.join(' '));

  let baseWord: string | null = null;
  let baseId: string | null = null;
  const ignoredBases: string[] = [];
  const seenModifiers = new Set<string>();
  const modifiers: ParseResult['modifiers'] = [];

  for (const token of tokens) {
    const b = lookupBase(token);
    if (b) {
      if (baseId === null) {
        baseId = b.id;
        baseWord = token;
      } else if (b.id !== baseId) {
        ignoredBases.push(token);
      }
      continue;
    }
    const m = lookupModifier(token);
    if (m && !seenModifiers.has(m.id)) {
      seenModifiers.add(m.id);
      modifiers.push({ id: m.id, word: token, describe: m.describe });
    }
  }

  const fallback = baseId === null;
  const chosenId = baseId ?? FALLBACK_BASE_ID;
  const builder = lookupBase(chosenId);
  if (!builder) throw new Error(`missing base sound: ${chosenId}`);
  const spec = builder.build();

  for (const m of modifiers) {
    const mod = lookupModifier(m.word);
    mod?.apply(spec);
  }

  spec.name = description.trim() || spec.name;
  return { spec, baseId: chosenId, baseWord, ignoredBases, modifiers, fallback, seed };
}
