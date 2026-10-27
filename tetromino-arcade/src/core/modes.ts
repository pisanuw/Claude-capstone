export type ModeId = 'marathon' | 'sprint' | 'ultra' | 'zen' | 'dig' | 'master' | 'versus';

export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  /** Lines needed to win (none = no line goal). */
  goalLines?: number;
  /** Game ends when this many frames have elapsed. */
  timeLimitFrames?: number;
  /** Garbage rows on the field at the start. */
  startGarbage?: number;
  /** Fixed level, or undefined to level up every 10 lines. */
  fixedLevel?: number;
  /** Always 20G gravity with shrinking lock delay. */
  twentyG?: boolean;
  /** Topping out clears the field instead of ending the game. */
  endless?: boolean;
  /** How records are ranked. */
  rankBy: 'score' | 'time';
}

export const FPS = 60;

export const MODES: Record<ModeId, ModeDef> = {
  marathon: {
    id: 'marathon',
    name: 'Marathon',
    blurb: 'Clear 150 lines. The pieces speed up every 10 lines.',
    goalLines: 150,
    rankBy: 'score',
  },
  sprint: {
    id: 'sprint',
    name: 'Sprint 40L',
    blurb: 'Clear 40 lines as fast as you can.',
    goalLines: 40,
    fixedLevel: 1,
    rankBy: 'time',
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra 2:00',
    blurb: 'Score as much as possible in two minutes.',
    timeLimitFrames: 2 * 60 * FPS,
    fixedLevel: 1,
    rankBy: 'score',
  },
  dig: {
    id: 'dig',
    name: 'Dig',
    blurb: 'Ten rows of messy garbage. Dig through all of them.',
    startGarbage: 10,
    fixedLevel: 1,
    rankBy: 'time',
  },
  master: {
    id: 'master',
    name: 'Master 20G',
    blurb: 'Pieces fall instantly and lock faster as you level up. 100 lines.',
    goalLines: 100,
    twentyG: true,
    rankBy: 'score',
  },
  zen: {
    id: 'zen',
    name: 'Zen',
    blurb: 'Slow, no pressure, no game over. Practise T-spins and stacking.',
    fixedLevel: 1,
    endless: true,
    rankBy: 'score',
  },
  versus: {
    id: 'versus',
    name: 'Versus CPU',
    blurb: 'Clear lines to send garbage to a CPU opponent. Last one standing wins.',
    rankBy: 'score',
  },
};

export const MODE_ORDER: ModeId[] = ['marathon', 'sprint', 'ultra', 'dig', 'master', 'versus', 'zen'];

export function formatTime(frames: number): string {
  const totalMs = Math.round((frames * 1000) / FPS);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
