import { describe, expect, it } from 'vitest';
import {
  MOON_G,
  classifyTouchdown,
  guidanceThrust,
  initialLander,
  mass,
  stepLander,
  targetVelocity,
} from '../src/core/descent';

describe('descent model', () => {
  it('follows a 30 m/s, then h/15, then 1 m/s profile', () => {
    expect(targetVelocity(2000)).toBe(-30);
    expect(targetVelocity(150)).toBe(-10);
    expect(targetVelocity(5)).toBe(-1);
  });

  it('commands hover thrust when on profile at the top', () => {
    const l = initialLander();
    const f = guidanceThrust({ altitude: 1500, velocity: -30, mass: mass(l) });
    expect(f / mass(l)).toBeCloseTo(MOON_G, 6);
  });

  it('never commands negative or excessive thrust', () => {
    expect(guidanceThrust({ altitude: 1500, velocity: 40, mass: 7000 })).toBe(0);
    expect(guidanceThrust({ altitude: 1500, velocity: -200, mass: 7000 })).toBeCloseTo(4.5 * 7320, 6);
  });

  it('burns fuel and falls freely when it runs out', () => {
    const l = { ...initialLander(), fuel: 0.01 };
    const next = stepLander(l, 0.1);
    expect(next.fuel).toBe(0);
    const coast = stepLander(next, 1);
    expect(coast.velocity).toBeCloseTo(next.velocity - MOON_G, 6);
  });

  it('keeps flying a held command (hover stays a hover)', () => {
    let l = initialLander();
    for (let i = 0; i < 10; i++) l = stepLander(l, 0.1);
    expect(l.velocity).toBeCloseTo(-30, 1);
    expect(l.fuel).toBeLessThan(initialLander().fuel);
  });

  it('classifies touchdowns', () => {
    expect(classifyTouchdown(1)).toBe('landed');
    expect(classifyTouchdown(4)).toBe('hard');
    expect(classifyTouchdown(9)).toBe('crashed');
  });
});
