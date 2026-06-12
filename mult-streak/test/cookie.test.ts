import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, newId } from '../src/cookie.js';
import type { GameState } from '../src/game.js';

const secret = 'test-secret';
const state: GameState = {
  v: 2,
  id: 'abc',
  streak: 4,
  lockoutUntil: 0,
  mode: 'mult',
  problem: { type: 'mult', a: 12, b: 13 },
};

describe('cookie signing', () => {
  it('round-trips state through encode/decode', () => {
    const decoded = decodeState(encodeState(state, secret), secret);
    expect(decoded).toEqual(state);
  });

  it('rejects a value signed with a different secret', () => {
    expect(decodeState(encodeState(state, secret), 'other-secret')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const value = encodeState(state, secret);
    const tampered = `x${value.slice(1)}`;
    expect(decodeState(tampered, secret)).toBeNull();
  });

  it('rejects missing or malformed values', () => {
    expect(decodeState(undefined, secret)).toBeNull();
    expect(decodeState('', secret)).toBeNull();
    expect(decodeState('nodot', secret)).toBeNull();
  });

  it('rejects a cookie without a schema version (old cookie)', () => {
    const noVersion = { id: state.id, streak: state.streak, lockoutUntil: state.lockoutUntil, problem: state.problem, mode: state.mode };
    const value = encodeState(noVersion as unknown as GameState, secret);
    expect(decodeState(value, secret)).toBeNull();
  });

  it('rejects a v:1 cookie (old schema)', () => {
    const v1 = { ...state, v: 1 };
    const value = encodeState(v1 as unknown as GameState, secret);
    expect(decodeState(value, secret)).toBeNull();
  });

  it('rejects a cookie with unknown mode', () => {
    const badMode = { ...state, mode: 'divide' };
    const value = encodeState(badMode as unknown as GameState, secret);
    expect(decodeState(value, secret)).toBeNull();
  });

  it('round-trips state and preserves the version field', () => {
    const decoded = decodeState(encodeState(state, secret), secret);
    expect(decoded?.v).toBe(2);
  });

  it('newId produces distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });
});
