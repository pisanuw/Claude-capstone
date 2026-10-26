import { describe, expect, it } from 'vitest';
import { fixedArith as F, floatArith, libmA } from '../src/core/arith';
import { botCommand, describeCommand, sameCommand } from '../src/core/bot';
import { FIELD, cloneWorld, createWorld, diffWorlds, hashWorld, step, unitsInOrder } from '../src/core/world';

const opts = { players: 2, unitsPerPlayer: 8, rngSeed: 7, localPlayer: 0 };

describe('world', () => {
  it('creates units with the local player first', () => {
    const w0 = createWorld(opts, F);
    const w1 = createWorld({ ...opts, localPlayer: 1 }, F);
    expect(w0.units.size).toBe(16);
    expect([...w0.units.keys()][0]).toBe(0);
    expect([...w1.units.keys()][0]).toBe(100);
    expect(unitsInOrder(w1, 'sorted')[0]?.id).toBe(0);
    // Same contents, different insertion order: the hash ignores the order.
    expect(hashWorld(w0, F)).toBe(hashWorld(w1, F));
    expect(diffWorlds(w0, w1, F)).toBeNull();
  });

  it('is deterministic for the same inputs and order', () => {
    const a = createWorld(opts, F);
    const b = createWorld({ ...opts, localPlayer: 1 }, F);
    for (let t = 0; t < 400; t++) {
      const inputs = [botCommand(5, 0, t), botCommand(5, 1, t)];
      step(a, inputs, 50, { arith: F, order: 'sorted' });
      step(b, inputs, 50, { arith: F, order: 'sorted' });
    }
    expect(a.tick).toBe(400);
    expect(hashWorld(a, F)).toBe(hashWorld(b, F));
  });

  it('diverges when iterating in insertion order', () => {
    const a = createWorld(opts, F);
    const b = createWorld({ ...opts, localPlayer: 1 }, F);
    step(a, [null, null], 50, { arith: F, order: 'insertion' });
    step(b, [null, null], 50, { arith: F, order: 'insertion' });
    const d = diffWorlds(a, b, F);
    expect(d).not.toBeNull();
    expect(d?.unit).toBe(0);
    expect(d?.count).toBeGreaterThan(1);
  });

  it('reports rng and missing-unit differences', () => {
    const a = createWorld(opts, F);
    const b = cloneWorld(a);
    b.rng = 99;
    expect(diffWorlds(a, b, F)?.field).toBe('rng');
    const c = cloneWorld(a);
    c.units.delete(3);
    expect(diffWorlds(a, c, F)?.field).toBe('(missing)');
  });

  it('applies move and stop commands to the right group and keeps units on the field', () => {
    const w = createWorld(opts, F);
    step(w, [{ kind: 'move', group: 0, x: 200, y: 100 }, null], 50, { arith: F, order: 'sorted' });
    expect(w.units.get(0)?.moving).toBe(true);
    expect(w.units.get(1)?.moving).toBe(false);
    expect(w.units.get(100)?.moving).toBe(false);
    for (let t = 0; t < 400; t++) step(w, [null, null], 50, { arith: F, order: 'sorted' });
    expect(w.units.get(0)?.moving).toBe(false); // arrived
    step(w, [{ kind: 'move', group: 2, x: 10, y: 10 }, null], 50, { arith: F, order: 'sorted' });
    expect(w.units.get(1)?.moving).toBe(true);
    step(w, [{ kind: 'stop', group: 1 }, null], 50, { arith: F, order: 'sorted' });
    expect(w.units.get(1)?.moving).toBe(false);
    expect(w.units.get(0)?.moving).toBe(true);
    for (const u of w.units.values()) {
      expect(F.toNumber(u.x)).toBeGreaterThanOrEqual(0);
      expect(F.toNumber(u.x)).toBeLessThanOrEqual(FIELD);
    }
  });

  it('pushes overlapping units apart, even exactly coincident ones', () => {
    const w = createWorld({ ...opts, unitsPerPlayer: 2 }, F);
    const [u, v] = unitsInOrder(w, 'sorted');
    v!.x = u!.x;
    v!.y = u!.y;
    step(w, [{ kind: 'stop', group: 2 }, null], 0, { arith: F, order: 'sorted' });
    expect(Math.abs(F.toNumber(v!.x) - F.toNumber(u!.x))).toBeGreaterThan(5);
  });

  it('runs on float32 too and clones independently', () => {
    const A = floatArith('strict', libmA);
    const w = createWorld(opts, A);
    const c = cloneWorld(w);
    step(w, [null, null], 50, { arith: A, order: 'sorted' });
    expect(c.tick).toBe(0);
    expect(hashWorld(c, A)).not.toBe(hashWorld(w, A));
    c.rng = w.rng;
    const d = diffWorlds(c, w, A);
    expect(d?.a).toMatch(/0x/);
  });
});

describe('bot and command helpers', () => {
  it('scripts are pure functions of (seed, player, tick)', () => {
    let moves = 0;
    let stops = 0;
    for (let t = 0; t < 4000; t++) {
      const c = botCommand(1, 0, t);
      expect(sameCommand(c, botCommand(1, 0, t))).toBe(true);
      if (c?.kind === 'move') {
        moves++;
        expect(c.x).toBeGreaterThanOrEqual(16);
        expect(c.x).toBeLessThanOrEqual(240);
      }
      if (c?.kind === 'stop') stops++;
    }
    expect(moves).toBeGreaterThan(40);
    expect(stops).toBeGreaterThan(5);
  });

  it('compares and describes commands', () => {
    expect(sameCommand(null, null)).toBe(true);
    expect(sameCommand(null, { kind: 'stop', group: 1 })).toBe(false);
    expect(sameCommand({ kind: 'stop', group: 1 }, { kind: 'stop', group: 0 })).toBe(false);
    expect(describeCommand(null)).toBe('no command');
    expect(describeCommand({ kind: 'move', group: 2, x: 3, y: 4 })).toBe('move all units to (3, 4)');
    expect(describeCommand({ kind: 'stop', group: 0 })).toBe('stop even units');
  });
});
