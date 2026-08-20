import type { CardState, Progress, ShortcutSet } from './types';
import { validateSet } from './library';

export const STORAGE_KEY = 'shortcut-sprint:v1';

export function defaultProgress(): Progress {
  return {
    v: 1,
    cards: {},
    days: [],
    customSets: [],
    settings: { setId: 'vscode', newPerDay: 8, macMode: false },
  };
}

export function serialize(p: Progress): string {
  return JSON.stringify(p);
}

function isCardState(x: unknown): x is CardState {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Record<string, unknown>;
  return ['ef', 'reps', 'intervalDays', 'due', 'lapses', 'seen', 'correct'].every(
    (k) => typeof c[k] === 'number' && Number.isFinite(c[k] as number),
  );
}

/**
 * Parse persisted progress. Returns a fresh default on any structural
 * problem (unknown version, malformed JSON, wrong shapes): corrupt local
 * state must never brick the app.
 */
export function deserialize(text: string | null): Progress {
  if (!text) return defaultProgress();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultProgress();
  }
  if (typeof raw !== 'object' || raw === null) return defaultProgress();
  const p = raw as Record<string, unknown>;
  if (p.v !== 1) return defaultProgress();

  const out = defaultProgress();

  if (typeof p.cards === 'object' && p.cards !== null) {
    for (const [setId, byId] of Object.entries(p.cards as Record<string, unknown>)) {
      if (typeof byId !== 'object' || byId === null) continue;
      const clean: Record<string, CardState> = {};
      for (const [id, card] of Object.entries(byId as Record<string, unknown>)) {
        if (isCardState(card)) clean[id] = card;
      }
      if (Object.keys(clean).length > 0) out.cards[setId] = clean;
    }
  }

  if (Array.isArray(p.days)) {
    out.days = p.days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  }

  if (Array.isArray(p.customSets)) {
    for (const s of p.customSets) {
      const result = validateSet(s);
      if (result.ok) out.customSets.push(result.set);
    }
  }

  if (typeof p.settings === 'object' && p.settings !== null) {
    const s = p.settings as Record<string, unknown>;
    if (typeof s.setId === 'string') out.settings.setId = s.setId;
    if (typeof s.newPerDay === 'number' && Number.isInteger(s.newPerDay) && s.newPerDay >= 1 && s.newPerDay <= 50) {
      out.settings.newPerDay = s.newPerDay;
    }
    if (typeof s.macMode === 'boolean') out.settings.macMode = s.macMode;
  }

  return out;
}

/** All sets visible to the player: bundled first, then custom. */
export function allSets(bundled: ShortcutSet[], p: Progress): ShortcutSet[] {
  return [...bundled, ...p.customSets];
}
