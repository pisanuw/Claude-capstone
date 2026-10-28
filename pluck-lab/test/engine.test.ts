import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_PARAMS, effectiveDecay, Engine, EQUAL_DECAY_REFERENCE_HZ } from '../src/core/engine';
import { CHORDS, strumEvents } from '../src/core/guitar';

const block = (e: Engine, n: number) => {
  const out = new Float32Array(n);
  e.process(out);
  return out;
};
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);

describe('Engine', () => {
  it('is silent until a pluck starts, then starts on the scheduled sample', () => {
    const e = new Engine(48000);
    e.schedule([{ string: 0, frequency: 110, delay: 100, velocity: 0.9, seed: 1 }]);
    const out = block(e, 200);
    expect(energy(out.subarray(0, 100))).toBe(0);
    expect(energy(out.subarray(100))).toBeGreaterThan(0);
    expect(e.time).toBe(200);
    expect(e.strings[0]!.active).toBe(true);
  });

  it('plays a strum in order and keeps output within [-1, 1]', () => {
    const e = new Engine(48000);
    e.setParams({ volume: 1 });
    const events = strumEvents(CHORDS[1]!, 'down', 10, 48000, 5);
    e.schedule([...events].reverse());
    const out = block(e, 48000);
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThanOrEqual(1);
    expect(e.strings.every((s) => s.active)).toBe(true);
  });

  it('ignores events for strings it does not have', () => {
    const e = new Engine(48000, 2);
    e.schedule([{ string: 4, frequency: 110, delay: 0, velocity: 1, seed: 1 }]);
    expect(energy(block(e, 64))).toBe(0);
  });

  it('damping cancels pending plucks and silences the strings', () => {
    const e = new Engine(48000);
    e.schedule([
      { string: 0, frequency: 110, delay: 0, velocity: 1, seed: 1 },
      { string: 1, frequency: 220, delay: 4800, velocity: 1, seed: 2 },
    ]);
    block(e, 10);
    e.damp();
    block(e, 48000);
    expect(e.strings[0]!.active).toBe(false);
    expect(e.strings[1]!.active).toBe(false);
  });

  it('swaps filters and keeps the old one on a compile error', () => {
    const e = new Engine(48000);
    const before = e.filter;
    expect(e.setFilter('return (')).toMatch(/Syntax/);
    expect(e.filter).toBe(before);
    expect(e.setFilter('return p.decay * x;')).toBeNull();
    expect(e.filter).not.toBe(before);
  });

  it('falls back to the default filter if a custom one throws mid-block', () => {
    const e = new Engine(48000);
    expect(e.setFilter('if (Math.abs(x) > 0.99) throw new Error("boom"); return x;')).toBeNull();
    e.schedule([{ string: 0, frequency: 4800, delay: 0, velocity: 1, seed: 1 }]);
    const out = block(e, 128);
    expect(e.lastError).toMatch(/boom/);
    expect(energy(out)).toBe(0);
    expect(energy(block(e, 128))).toBeGreaterThan(0);
  });

  it('applies equal decay per note, and updates sounding strings', () => {
    expect(effectiveDecay({ decay: 0.99, decayMode: 'natural' }, 440)).toBe(0.99);
    expect(effectiveDecay({ decay: 0.99, decayMode: 'equal' }, EQUAL_DECAY_REFERENCE_HZ)).toBeCloseTo(0.99, 12);
    expect(effectiveDecay({ decay: 0.99, decayMode: 'equal' }, 440)).toBeCloseTo(Math.pow(0.99, 0.25), 12);
    const e = new Engine(48000);
    e.schedule([{ string: 5, frequency: 330, delay: 0, velocity: 1, seed: 1 }]);
    block(e, 1);
    e.setParams({ decayMode: 'equal' });
    expect(e.params.decayMode).toBe('equal');
    expect(DEFAULT_ENGINE_PARAMS.decayMode).toBe('natural');
  });

  it('with equal decay, a high note keeps ringing about as long as a low one', () => {
    const run = (mode: 'natural' | 'equal', f: number) => {
      const e = new Engine(48000);
      e.setParams({ decayMode: mode, volume: 0.1 });
      e.schedule([{ string: 0, frequency: f, delay: 0, velocity: 1, seed: 3 }]);
      block(e, 48000);
      return energy(block(e, 4800));
    };
    expect(run('natural', 330) / run('natural', 110)).toBeLessThan(0.05);
    expect(run('equal', 330) / run('equal', 110)).toBeGreaterThan(0.2);
  });
});

describe('applyMessage', () => {
  it('routes every message type', async () => {
    const { applyMessage } = await import('../src/core/messages');
    const e = new Engine(48000);
    expect(applyMessage(e, { type: 'params', params: { decay: 0.9 } })).toBeNull();
    expect(e.params.decay).toBe(0.9);
    expect(applyMessage(e, { type: 'pluck', events: [{ string: 0, frequency: 200, delay: 0, velocity: 1, seed: 1 }] })).toBeNull();
    block(e, 1);
    expect(e.strings[0]!.active).toBe(true);
    expect(applyMessage(e, { type: 'damp' })).toBeNull();
    expect(applyMessage(e, { type: 'filter', source: 'return x;' })).toBeNull();
    expect(applyMessage(e, { type: 'filter', source: 'nope(' })).toMatch(/Syntax/);
  });
});
