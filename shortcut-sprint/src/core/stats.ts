import type { CardState, ShortcutSet } from './types';
import { isMature } from './sm2';

export interface SetStats {
  setId: string;
  tool: string;
  total: number;
  started: number;
  mature: number;
  /** 0..1: blend of coverage (cards started) and maturity. */
  mastery: number;
  /** 0..1 lifetime answer accuracy across started cards; 0 when unseen. */
  accuracy: number;
}

/**
 * Mastery is half coverage (started / total) and half maturity
 * (mature / total): starting every card gets a set to 50%, holding every
 * card at a 21-day interval gets it to 100%.
 */
export function setStats(set: ShortcutSet, cards: Record<string, CardState> | undefined): SetStats {
  const total = set.shortcuts.length;
  let started = 0;
  let mature = 0;
  let seen = 0;
  let correct = 0;
  for (const s of set.shortcuts) {
    const card = cards?.[s.id];
    if (!card || card.seen === 0) continue;
    started += 1;
    seen += card.seen;
    correct += card.correct;
    if (isMature(card)) mature += 1;
  }
  const mastery = total === 0 ? 0 : (started / total) * 0.5 + (mature / total) * 0.5;
  const accuracy = seen === 0 ? 0 : correct / seen;
  return { setId: set.id, tool: set.tool, total, started, mature, mastery, accuracy };
}

/** Points string for an SVG radar polygon; values are 0..1, one per axis. */
export function radarPoints(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length;
  if (n === 0) return '';
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const clamped = Math.min(1, Math.max(0, v));
      const x = cx + Math.cos(angle) * r * clamped;
      const y = cy + Math.sin(angle) * r * clamped;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Axis label anchor positions for the radar chart. */
export function radarAxes(n: number, cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
}
