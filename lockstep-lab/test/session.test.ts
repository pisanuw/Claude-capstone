import { describe, expect, it } from 'vitest';
import { PRESETS } from '../src/core/presets';
import { DEFAULT_CONFIG, DETERMINISTIC, type SessionConfig, Session, clientProfile, summarize } from '../src/core/session';
import { sweepDelays } from '../src/core/sweep';

function cfg(patch: Partial<SessionConfig> = {}): SessionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...patch,
    nondet: { ...DETERMINISTIC, ...patch.nondet },
    net: { ...DEFAULT_CONFIG.net, ...patch.net },
  };
}

function hashesAt(s: Session, ticks: number[]): number[] {
  return ticks.map((t) => s.clients[0]?.hashes.get(t) as number);
}

describe('deterministic sessions', () => {
  it('stay in sync for both models on a lossy, jittery network', () => {
    for (const mode of ['lockstep', 'rollback'] as const) {
      const s = new Session(cfg({ mode, inputDelay: 1, net: { latencyMs: 90, jitterMs: 70, lossPct: 10, reorder: true } }));
      s.runTicks(1500);
      expect(s.compared).toBeGreaterThanOrEqual(1500);
      expect(s.desync).toBeNull();
      expect(s.recent.every((c) => c.match)).toBe(true);
    }
  });

  it('rollback confirms exactly the states lockstep computes', () => {
    // Inputs are a pure function of (player, tick), so with every nondeterminism
    // source off, the confirmed state at tick t must not depend on the netcode,
    // the input delay (once both are past it) or the network.
    const ticks = [400, 800, 1199];
    const lock = new Session(cfg({ mode: 'lockstep', inputDelay: 3 }));
    lock.runTicks(1200);
    const roll = new Session(cfg({ mode: 'rollback', inputDelay: 3, net: { latencyMs: 200, jitterMs: 90, lossPct: 15, reorder: true } }));
    roll.runTicks(1200);
    expect(roll.clients[0]!.stats.rollbacks).toBeGreaterThan(0);
    expect(hashesAt(roll, ticks)).toEqual(hashesAt(lock, ticks));
  });

  it('supports three and four players', () => {
    for (const players of [3, 4]) {
      const s = new Session(cfg({ players, mode: 'rollback', inputDelay: 1 }));
      s.runTicks(400);
      expect(s.clients).toHaveLength(players);
      expect(s.desync).toBeNull();
    }
  });

  it('delivers a user command on the local tick plus the input delay', () => {
    const s = new Session(cfg({ bots: false, inputDelay: 2 }));
    s.advance(500);
    s.command(1, { kind: 'move', group: 2, x: 128, y: 128 });
    s.command(9, { kind: 'stop', group: 2 }); // unknown player: ignored
    s.advance(1000);
    for (const c of s.clients) expect(c.world.units.get(100)?.moving || c.world.units.get(100)?.x).toBeTruthy();
    expect(s.clients[0]!.world.units.get(100)?.moving).toBe(true);
    expect(s.clients[0]!.world.units.get(0)?.moving).toBe(false);
    expect(s.desync).toBeNull();
  });
});

describe('nondeterminism sources', () => {
  const cases: Array<[string, Partial<typeof DETERMINISTIC>, string]> = [
    ['float-mixed', { arithmetic: 'float-mixed' }, ''],
    ['unseeded RNG', { unseededRng: true }, 'rng'],
    ['insertion order', { insertionOrder: true }, ''],
    ['frame dt', { frameDt: true }, 'x'],
  ];
  for (const [name, nd, field] of cases) {
    it(`${name} desyncs with a field-level diff`, () => {
      const s = new Session(cfg({ nondet: { ...DETERMINISTIC, ...nd } }));
      s.runTicks(600);
      expect(s.desync).not.toBeNull();
      expect(s.desync!.diff).not.toBeNull();
      if (field) expect(s.desync!.diff!.field).toBe(field);
      expect(s.desync!.hashes[0]).not.toBe(s.desync!.hashes[1]);
      expect(s.recent.some((c) => !c.match)).toBe(true);
    });
  }

  it('float32 on identical platforms stays in sync', () => {
    const s = new Session(cfg({ nondet: { ...DETERMINISTIC, arithmetic: 'float-same' } }));
    s.runTicks(1500);
    expect(s.desync).toBeNull();
  });

  it('describes each client profile', () => {
    const c = cfg({ nondet: { arithmetic: 'float-mixed', unseededRng: true, insertionOrder: true, frameDt: true } });
    const a = clientProfile(c, 0);
    const b = clientProfile(c, 1);
    expect(a.arith.name).not.toBe(b.arith.name);
    expect(a.rngSeed).not.toBe(b.rngSeed);
    expect(a.order).toBe('insertion');
    expect(b.dtLabel).toContain('144 Hz');
    expect(clientProfile(cfg(), 1).dtLabel).toBe('fixed 50 ms');
  });
});

describe('netcode costs', () => {
  const bad = { latencyMs: 120, jitterMs: 60, lossPct: 5, reorder: true };

  it('lockstep stalls when the input delay is shorter than the network delay', () => {
    const s = new Session(cfg({ mode: 'lockstep', inputDelay: 1, net: bad }));
    s.advance(20_000);
    const sum = summarize(s.clients[0]!, s.now);
    expect(sum.stallPct).toBeGreaterThan(20);
    expect(sum.ticks).toBeLessThan(380); // the game itself slowed down
    expect(sum.resimPerTick).toBe(0);
  });

  it('rollback keeps time with low input lag and pays in re-simulation', () => {
    const s = new Session(cfg({ mode: 'rollback', inputDelay: 0, net: bad }));
    s.advance(20_000);
    const sum = summarize(s.clients[0]!, s.now);
    expect(sum.stallPct).toBe(0);
    expect(sum.avgLagMs).toBeLessThan(5);
    expect(sum.resimPerTick).toBeGreaterThan(0);
    expect(sum.maxRollback).toBeGreaterThan(1);
    expect(sum.rollbacksPerSec).toBeGreaterThan(0);
    expect(s.clients[0]!.stats.predictions).toBeGreaterThan(0);
    expect(s.clients[0]!.timeline.length).toBeGreaterThan(10);
  });

  it('rollback stalls when the prediction window is exhausted', () => {
    const s = new Session(cfg({ mode: 'rollback', inputDelay: 0, maxPrediction: 2, net: { ...bad, latencyMs: 400 } }));
    s.advance(10_000);
    expect(s.clients[0]!.stats.stallMs).toBeGreaterThan(1000);
    expect(s.desync).toBeNull();
  });

  it('summarize handles an idle client', () => {
    const s = new Session(cfg());
    expect(summarize(s.clients[0]!, 0)).toMatchObject({ avgLagMs: 0, stallPct: 0, resimPerTick: 0, rollbacksPerSec: 0 });
  });

  it('the delay sweep shows the trade-off', () => {
    const pts = sweepDelays(cfg({ net: bad }), [0, 2, 5], 8000);
    const lock = pts.filter((p) => p.mode === 'lockstep');
    const roll = pts.filter((p) => p.mode === 'rollback');
    expect(lock[0]!.stallPct).toBeGreaterThan(lock[2]!.stallPct);
    expect(roll[0]!.resimPerTick).toBeGreaterThan(roll[2]!.resimPerTick);
    expect(roll[0]!.avgLagMs).toBeLessThan(roll[2]!.avgLagMs);
    expect(roll.every((p) => p.stallPct === 0)).toBe(true);
  });
});

describe('presets', () => {
  it('behave as their descriptions say', () => {
    const expectSync: Record<string, boolean> = {
      sync: true,
      float: false,
      'float-same': true,
      rng: false,
      order: false,
      'frame-dt': false,
      'lockstep-bad': true,
      'rollback-bad': true,
    };
    for (const p of PRESETS) {
      const s = new Session(p.config);
      s.runTicks(500);
      expect(s.desync === null, p.id).toBe(expectSync[p.id]);
    }
  });
});
