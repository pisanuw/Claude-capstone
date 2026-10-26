import { describe, expect, it } from 'vitest';
import { FakeNetwork } from '../src/core/network';

describe('fake network', () => {
  it('delays packets by latency plus bounded jitter', () => {
    const n = new FakeNetwork<number>({ latencyMs: 50, jitterMs: 10, lossPct: 0, reorder: true }, 1);
    for (let i = 0; i < 100; i++) n.send(0, 1, 0, i);
    expect(n.deliver(49)).toHaveLength(0);
    expect(n.pending).toBe(100);
    const got = n.deliver(60);
    expect(got).toHaveLength(100);
    for (const p of got) {
      expect(p.deliverAt).toBeGreaterThanOrEqual(50);
      expect(p.deliverAt).toBeLessThanOrEqual(60);
    }
    expect(n.deliver(1000)).toHaveLength(0);
  });

  it('drops roughly the configured share of packets', () => {
    const n = new FakeNetwork<number>({ latencyMs: 0, jitterMs: 0, lossPct: 20, reorder: true }, 2);
    for (let i = 0; i < 2000; i++) n.send(0, 1, 0, i);
    expect(n.dropped / n.sent).toBeGreaterThan(0.15);
    expect(n.dropped / n.sent).toBeLessThan(0.25);
  });

  it('reorders only when allowed', () => {
    const send = (reorder: boolean) => {
      const n = new FakeNetwork<number>({ latencyMs: 20, jitterMs: 40, lossPct: 0, reorder }, 3);
      for (let i = 0; i < 200; i++) n.send(0, 1, i, i);
      const order = n.deliver(10_000).map((p) => p.payload);
      return { n, inOrder: order.every((v, i) => i === 0 || v > (order[i - 1] as number)) };
    };
    const fifo = send(false);
    expect(fifo.inOrder).toBe(true);
    expect(fifo.n.reordered).toBe(0);
    const loose = send(true);
    expect(loose.inOrder).toBe(false);
    expect(loose.n.reordered).toBeGreaterThan(0);
  });
});
