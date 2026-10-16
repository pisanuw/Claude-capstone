import { describe, expect, it } from 'vitest';
import { verify } from '../src/core/commit';
import { Session } from '../src/core/session';

describe('Session', () => {
  it('rejects a bad target', () => {
    expect(() => new Session('easy', 0)).toThrow();
  });

  it('requires a commitment before a press and scores against it', async () => {
    const s = new Session('easy', 3, () => 'n0');
    expect(() => s.press(0)).toThrow(/commitment/);
    expect(s.pendingCommitment).toBeNull();
    const c = await s.next();
    expect(await s.next()).toBe(c); // same commitment until pressed
    expect(s.pendingCommitment).toBe(c);
    expect(c.prediction).toBe(0);
    const r = s.press(1);
    expect(r.correct).toBe(false);
    expect(await verify(r.commitment.hash, r.commitment.prediction, 'n0')).toBe(true);
    await s.next();
    s.press(1);
    await s.next();
    s.press(1);
    expect(s.done).toBe(true);
    expect(s.bits).toEqual([1, 1, 1]);
    expect(s.correct).toEqual([false, true, true]);
    expect(s.hits).toBe(2);
    await expect(s.next()).rejects.toThrow(/over/);
    expect(() => s.press(0)).toThrow(/over/);
  });

  it('works in hard mode with random nonces', async () => {
    const s = new Session('hard', 2);
    const c = await s.next();
    expect(c.nonce).toMatch(/^[0-9a-f]{32}$/);
    s.press(0);
    expect(s.rounds).toHaveLength(1);
  });
});
