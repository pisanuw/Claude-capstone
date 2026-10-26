import { describe, expect, it } from 'vitest';
import { ANGLE_UNITS, fixedArith as F, floatArith, libmA, libmB, tableSin } from '../src/core/arith';
import { Fnv, float32Bits, hashInts, hex32, makeRandom, nextRandom } from '../src/core/rng';

describe('Q16.16 fixed point', () => {
  it('round-trips and does exact integer arithmetic', () => {
    expect(F.toNumber(F.from(3.25))).toBe(3.25);
    expect(F.toNumber(F.mul(F.from(1.5), F.from(-2)))).toBe(-3);
    expect(F.toNumber(F.div(F.from(7), F.from(2)))).toBe(3.5);
    expect(F.toNumber(F.sub(F.from(1), F.from(0.25)))).toBe(0.75);
    expect(F.toNumber(F.add(F.from(1), F.from(0.25)))).toBe(1.25);
    expect(F.lt(F.from(1), F.from(2))).toBe(true);
  });

  it('takes integer square roots exactly', () => {
    expect(F.toNumber(F.sqrt(F.from(16)))).toBe(4);
    expect(F.sqrt(0)).toBe(0);
    expect(F.sqrt(-5)).toBe(0);
    for (const v of [1, 2, 3, 12345, F.from(200), F.from(65535)]) {
      const r = F.sqrt(v);
      expect(r * r).toBeLessThanOrEqual(v * 65536);
      expect((r + 1) * (r + 1)).toBeGreaterThan(v * 65536);
    }
  });

  it('uses a sine table that matches Math.sin to within one table step', () => {
    for (let a = -ANGLE_UNITS; a <= 2 * ANGLE_UNITS; a += 37) {
      expect(Math.abs(tableSin(a) / 65536 - Math.sin((a * 2 * Math.PI) / ANGLE_UNITS))).toBeLessThan(2e-5);
    }
    expect(F.toNumber(F.cos(0))).toBe(1);
    expect(F.toNumber(F.sin(F.angle(1024)))).toBe(1);
    expect(F.wrapAngle(-1)).toBe(4095);
    expect(F.wrapAngle(4097)).toBe(1);
    expect(F.store(123)).toBe(123);
    expect(F.bits(-1)).toBe(-1);
  });
});

describe('float32 platforms', () => {
  const strict = floatArith('strict', libmA);
  const ext = floatArith('extended', libmB);

  it('libm B agrees with Math.sin closely but not bit-for-bit', () => {
    let maxErr = 0;
    let differ = 0;
    for (let x = -10; x < 10; x += 0.01) {
      maxErr = Math.max(maxErr, Math.abs(libmB.sin(x) - Math.sin(x)), Math.abs(libmB.cos(x) - Math.cos(x)));
      if (Math.fround(libmB.sin(x)) !== Math.fround(Math.sin(x))) differ++;
    }
    expect(maxErr).toBeLessThan(1e-6);
    expect(differ).toBeGreaterThan(0);
  });

  it('strict rounds each step while extended rounds only on store', () => {
    const a = strict.from(16777216); // 2^24: adding 1 is lost in float32
    expect(strict.sub(strict.add(a, 1), a)).toBe(0);
    expect(ext.store(ext.sub(ext.add(a, 1), a))).toBe(1);
    expect(strict.mul(strict.from(3), strict.from(0.1))).toBe(Math.fround(Math.fround(3) * Math.fround(0.1)));
    expect(strict.div(1, 3)).toBe(Math.fround(1 / 3));
    expect(strict.sqrt(-1)).toBe(0);
    expect(strict.sqrt(4)).toBe(2);
    expect(strict.toNumber(2.5)).toBe(2.5);
    expect(strict.lt(1, 2)).toBe(true);
  });

  it('wraps angles into [0, 2π) and hashes float32 bits', () => {
    expect(strict.wrapAngle(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 5);
    expect(strict.wrapAngle(7)).toBeCloseTo(7 - 2 * Math.PI, 5);
    expect(strict.angle(1024)).toBe(Math.fround(Math.PI / 2));
    expect(strict.bits(1)).toBe(0x3f800000);
    expect(strict.sin(0)).toBe(0);
    expect(ext.cos(0)).toBe(1);
    expect(strict.name).toContain('strict');
  });
});

describe('rng helpers', () => {
  it('mulberry32 is reproducible and in range', () => {
    const a = makeRandom(42);
    const b = makeRandom(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(nextRandom(1).state).toBe(nextRandom(1).state);
  });

  it('hashes are stable and sensitive', () => {
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(1, 2, 4));
    expect(new Fnv().text('ab').value()).not.toBe(new Fnv().text('ba').value());
    expect(new Fnv().double(0.1).value()).not.toBe(new Fnv().double(0.1 + 1e-17 + 1e-16).value());
    expect(float32Bits(-2)).toBe(0xc0000000);
    expect(hex32(255)).toBe('000000ff');
  });
});
