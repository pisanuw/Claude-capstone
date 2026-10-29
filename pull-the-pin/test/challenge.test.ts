import { describe, expect, it } from 'vitest';
import { TIERS, decodeChallenge, encodeChallenge, generate, grade, hasVisibleSymptom, rng, tierPool, type Challenge } from '../src/core/challenge';
import { faultKey, type Fault } from '../src/core/faults';
import { netId, pinId } from '../src/core/netlist';
import { romAddress } from '../src/core/isa';

describe('rng', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('challenges', () => {
  it('draws the same visible fault from the same seed, inside the tier', () => {
    for (const tier of ['bench', 'board', 'deep'] as const) {
      const c = generate(12345, tier);
      expect(faultKey(c.fault)).toBe(faultKey(generate(12345, tier).fault));
      expect(TIERS[tier].includes(c.fault)).toBe(true);
      expect(hasVisibleSymptom(c.fault)).toBe(true);
      expect(c.budget).toBe(TIERS[tier].budget);
    }
    expect(tierPool('bench').every((f) => f.kind === 'stuck' || f.kind === 'dead')).toBe(true);
    expect(tierPool('board').some((f) => f.kind === 'rom')).toBe(false);
  });

  it('knows a ROM bit the test programs never read has no symptom', () => {
    expect(hasVisibleSymptom({ kind: 'rom', addr: romAddress(1, 1, 0, 4), bit: 3 })).toBe(false);
  });

  it('round-trips seeded and hand-picked links without showing the fault', () => {
    const seeded = generate(99, 'board');
    expect(decodeChallenge(encodeChallenge(seeded))).toEqual(seeded);
    const picked: Challenge = { tier: 'deep', fault: { kind: 'open', pin: pinId('IR.Y2') }, budget: 6, seed: null };
    const code = encodeChallenge(picked);
    expect(code).not.toContain('IR');
    expect(atob(code.replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('IR.Y2');
    expect(decodeChallenge(code)).toEqual(picked);
  });

  it.each(['', '!!!', btoa('x|bench|1'), btoa('s|nope|1')])('rejects bad code %j', (code) => {
    expect(decodeChallenge(code)).toBeNull();
  });

  it('rejects malformed bodies', () => {
    const enc = (body: string) => {
      const mask = 'pull-the-pin';
      const s = Array.from(body, (c, i) => String.fromCharCode(c.charCodeAt(0) ^ (mask.charCodeAt(i % mask.length) & 31))).join('');
      return btoa(s);
    };
    expect(decodeChallenge(enc('s|bench|-1'))).toBeNull();
    expect(decodeChallenge(enc('f|bench|dead:CPU|5'))).toBeNull();
    expect(decodeChallenge(enc('f|bench|dead:ALU|0'))).toBeNull();
    expect(decodeChallenge(enc('f|bench|dead:ALU|5'))?.fault).toEqual({ kind: 'dead', chip: 'ALU' });
    expect(decodeChallenge(enc('q|bench|1'))).toBeNull();
  });
});

describe('grade', () => {
  const truth: Fault = { kind: 'stuck', net: netId('BUS2'), value: 0 };
  it('is exact for the same fault', () => expect(grade(truth, truth)).toBe('exact'));
  it('is wrong for a different one', () => expect(grade({ kind: 'stuck', net: netId('BUS2'), value: 1 }, truth)).toBe('wrong'));
  it('accepts an indistinguishable fault', () => {
    const a: Fault = { kind: 'rom', addr: romAddress(1, 1, 0, 4), bit: 3 };
    const b: Fault = { kind: 'rom', addr: romAddress(1, 1, 0, 4), bit: 4 };
    expect(grade(a, b)).toBe('equivalent');
  });
});
