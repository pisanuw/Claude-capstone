import { makeRandom } from './rng';

export interface NetConfig {
  /** One-way base latency. */
  latencyMs: number;
  /** Extra uniformly random delay in [0, jitterMs]. */
  jitterMs: number;
  /** Percentage of packets dropped, 0-100. */
  lossPct: number;
  /** When false, each link delivers in send order (like a TCP-ish channel without the retransmit). */
  reorder: boolean;
}

export interface Packet<T> {
  from: number;
  to: number;
  sentAt: number;
  deliverAt: number;
  payload: T;
}

/** A seeded fake network: everything about it is reproducible from the seed. */
export class FakeNetwork<T> {
  private readonly random: () => number;
  private inFlight: Packet<T>[] = [];
  private lastDelivery = new Map<string, number>();
  sent = 0;
  dropped = 0;
  reordered = 0;

  constructor(
    public config: NetConfig,
    seed: number,
  ) {
    this.random = makeRandom(seed ^ 0x5eed);
  }

  send(from: number, to: number, now: number, payload: T): void {
    this.sent++;
    if (this.random() * 100 < this.config.lossPct) {
      this.dropped++;
      return;
    }
    let deliverAt = now + this.config.latencyMs + Math.floor(this.random() * (this.config.jitterMs + 1));
    const key = `${from}>${to}`;
    const last = this.lastDelivery.get(key) ?? -Infinity;
    if (!this.config.reorder) deliverAt = Math.max(deliverAt, last);
    else if (deliverAt < last) this.reordered++;
    this.lastDelivery.set(key, Math.max(last, deliverAt));
    this.inFlight.push({ from, to, sentAt: now, deliverAt, payload });
  }

  /** Removes and returns the packets due by `now`, in delivery order. */
  deliver(now: number): Packet<T>[] {
    if (this.inFlight.length === 0) return [];
    const due: Packet<T>[] = [];
    const later: Packet<T>[] = [];
    for (const p of this.inFlight) (p.deliverAt <= now ? due : later).push(p);
    this.inFlight = later;
    return due.sort((a, b) => a.deliverAt - b.deliverAt);
  }

  get pending(): number {
    return this.inFlight.length;
  }
}
