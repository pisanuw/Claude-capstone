import { hashInts } from './rng';
import type { Command } from './world';

/**
 * A scripted player: a pure function of (seed, player, tick), so the same
 * input is produced however often a client asks for it.
 */
export function botCommand(seed: number, player: number, tick: number): Command | null {
  const h = hashInts(seed, player, tick, 0xb07);
  const roll = h % 1000;
  if (roll < 25) {
    return {
      kind: 'move',
      group: (hashInts(h, 1) % 3) as 0 | 1 | 2,
      x: 16 + (hashInts(h, 2) % 225),
      y: 16 + (hashInts(h, 3) % 225),
    };
  }
  if (roll < 30) return { kind: 'stop', group: (hashInts(h, 4) % 3) as 0 | 1 | 2 };
  return null;
}

export function sameCommand(a: Command | null, b: Command | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function describeCommand(c: Command | null): string {
  if (!c) return 'no command';
  const g = ['even units', 'odd units', 'all units'][c.group];
  return c.kind === 'move' ? `move ${g} to (${c.x}, ${c.y})` : `stop ${g}`;
}
