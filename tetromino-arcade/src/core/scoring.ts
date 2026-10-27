// Guideline-style scoring and versus attack tables, kept as pure functions so
// they can be tested without running a game.

export type Spin = 'none' | 'mini' | 'full';

const LINE_POINTS = [0, 100, 300, 500, 800];
const TSPIN_POINTS = [400, 800, 1200, 1600];
const MINI_POINTS = [100, 200, 400];
const PC_POINTS = [0, 800, 1200, 1800, 2000];

/** Points for a lock before the level multiplier and back-to-back bonus. */
export function basePoints(lines: number, spin: Spin): number {
  if (spin === 'full') return TSPIN_POINTS[lines] ?? 0;
  if (spin === 'mini') return MINI_POINTS[lines] ?? 0;
  return LINE_POINTS[lines] ?? 0;
}

/** A "difficult" clear keeps (or starts) a back-to-back chain. */
export function isDifficult(lines: number, spin: Spin): boolean {
  return lines === 4 || (spin !== 'none' && lines > 0);
}

export interface ClearResult {
  points: number;
  attack: number;
  label: string;
  /** Back-to-back bonus was applied to this clear. */
  b2bBonus: boolean;
}

/**
 * Score one lock.
 * @param combo combo count after this lock (0 = first clear in a row).
 * @param b2bBefore whether the previous clear was difficult.
 */
export function scoreClear(
  lines: number,
  spin: Spin,
  level: number,
  combo: number,
  b2bBefore: boolean,
  perfectClear: boolean,
): ClearResult {
  const difficult = isDifficult(lines, spin);
  const b2bBonus = difficult && b2bBefore;
  let points = basePoints(lines, spin) * level;
  if (b2bBonus) points = Math.floor(points * 1.5);
  if (lines > 0 && combo > 0) points += 50 * combo * level;
  if (perfectClear) points += (b2bBonus && lines === 4 ? 3200 : PC_POINTS[lines]) * level;
  return {
    points,
    attack: lines > 0 ? attackFor(lines, spin, b2bBonus, combo, perfectClear) : 0,
    label: clearLabel(lines, spin, b2bBonus, combo, perfectClear),
    b2bBonus,
  };
}

const COMBO_ATTACK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

/** Garbage rows sent to an opponent in versus mode. */
export function attackFor(
  lines: number,
  spin: Spin,
  b2bBonus: boolean,
  combo: number,
  perfectClear: boolean,
): number {
  let attack: number;
  if (spin === 'full') attack = lines * 2;
  else if (spin === 'mini') attack = lines === 2 ? 1 : 0;
  else attack = [0, 0, 1, 2, 4][lines];
  if (b2bBonus) attack += 1;
  attack += COMBO_ATTACK[Math.min(Math.max(combo, 0), COMBO_ATTACK.length - 1)];
  if (perfectClear) attack += 10;
  return attack;
}

const LINE_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris'];

export function clearLabel(
  lines: number,
  spin: Spin,
  b2bBonus: boolean,
  combo: number,
  perfectClear: boolean,
): string {
  const parts: string[] = [];
  if (b2bBonus) parts.push('Back-to-Back');
  if (spin === 'full') parts.push(lines ? `T-Spin ${LINE_NAMES[lines]}` : 'T-Spin');
  else if (spin === 'mini') parts.push(lines ? `Mini T-Spin ${LINE_NAMES[lines]}` : 'Mini T-Spin');
  else if (lines) parts.push(LINE_NAMES[lines]);
  if (lines > 0 && combo > 0) parts.push(`${combo} Combo`);
  if (perfectClear) parts.push('Perfect Clear');
  return parts.join(' · ');
}

/**
 * Gravity in rows per frame (60 fps) for a level, following the guideline
 * curve: seconds per row = (0.8 - (level - 1) * 0.007) ^ (level - 1).
 * Capped at 20 rows per frame ("20G").
 */
export function gravityFor(level: number): number {
  const l = Math.max(1, level);
  const secondsPerRow = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.min(20, 1 / (secondsPerRow * 60));
}
