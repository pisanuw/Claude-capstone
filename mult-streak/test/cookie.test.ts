import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, newId } from '../src/cookie.js';
import type { GameState } from '../src/game.js';

const secret = 'test-secret';
const state: GameState = { id: 'abc', streak: 4, lockoutUntil: 0, problem: { a: 12, b: 13 } };

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

  it('newId produces distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });
});
