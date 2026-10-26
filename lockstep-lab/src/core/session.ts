import { type Arith, fixedArith, floatArith, libmA, libmB } from './arith';
import { botCommand, sameCommand } from './bot';
import { FakeNetwork, type NetConfig } from './network';
import { hashInts, makeRandom } from './rng';
import { type Command, type World, type WorldDiff, cloneWorld, createWorld, diffWorlds, hashWorld, step } from './world';

export type Mode = 'lockstep' | 'rollback';
export type Arithmetic = 'fixed' | 'float-same' | 'float-mixed';

export interface Nondeterminism {
  /** fixed: Q16.16 everywhere. float-same: float32, identical platforms. float-mixed: float32, platforms differ. */
  arithmetic: Arithmetic;
  /** Each client seeds the game RNG from its own clock instead of the match seed. */
  unseededRng: boolean;
  /** Units are iterated in Map insertion order, which differs per client. */
  insertionOrder: boolean;
  /** Each tick advances by the client's measured frame time instead of a fixed tick. */
  frameDt: boolean;
}

export interface SessionConfig {
  players: number;
  unitsPerPlayer: number;
  mode: Mode;
  /** Ticks between sampling a local input and executing it. */
  inputDelay: number;
  tickMs: number;
  /** Rollback only: how many unconfirmed ticks a client may run ahead before it stalls. */
  maxPrediction: number;
  seed: number;
  nondet: Nondeterminism;
  net: NetConfig;
  bots: boolean;
}

export const DETERMINISTIC: Nondeterminism = {
  arithmetic: 'fixed',
  unseededRng: false,
  insertionOrder: false,
  frameDt: false,
};

export const DEFAULT_CONFIG: SessionConfig = {
  players: 2,
  unitsPerPlayer: 12,
  mode: 'lockstep',
  inputDelay: 3,
  tickMs: 50,
  maxPrediction: 8,
  seed: 1997,
  nondet: { ...DETERMINISTIC },
  net: { latencyMs: 60, jitterMs: 20, lossPct: 0, reorder: true },
  bots: true,
};

/** Frame rates of the simulated machines: 60, 144, 30 and 75 Hz. */
const FRAME_MS = [1000 / 60, 1000 / 144, 1000 / 30, 1000 / 75];

export interface ClientProfile {
  index: number;
  frameMs: number;
  arith: Arith;
  rngSeed: number;
  order: 'sorted' | 'insertion';
  dtLabel: string;
}

export function clientProfile(cfg: SessionConfig, i: number): ClientProfile {
  const nd = cfg.nondet;
  let arith = fixedArith;
  if (nd.arithmetic === 'float-same') arith = floatArith('strict', libmA);
  if (nd.arithmetic === 'float-mixed') arith = i % 2 === 0 ? floatArith('strict', libmA) : floatArith('extended', libmB);
  const frameMs = FRAME_MS[i % FRAME_MS.length] as number;
  return {
    index: i,
    frameMs,
    arith,
    // "Unseeded" stands for seeding from Date.now() at boot: a per-machine value.
    rngSeed: nd.unseededRng ? hashInts(0xc10c, i, 1_700_000_000 + i * 7919) : hashInts(cfg.seed, 0x6a3e),
    order: nd.insertionOrder ? 'insertion' : 'sorted',
    dtLabel: nd.frameDt ? `measured frame time (${Math.round(1000 / frameMs)} Hz)` : `fixed ${cfg.tickMs} ms`,
  };
}

interface Payload {
  inputs: Array<[number, Command | null]>;
  /** Highest tick up to which the sender holds all of the recipient's inputs. */
  ack: number;
}

export interface Bucket {
  /** Wall-clock second this bucket covers. */
  second: number;
  stallMs: number;
  resimTicks: number;
  rollbacks: number;
  ticks: number;
}

export interface ClientStats {
  ticks: number;
  stallMs: number;
  rollbacks: number;
  resimTicks: number;
  maxRollback: number;
  predictions: number;
  mispredictions: number;
  lagSum: number;
  lagCount: number;
}

const STATE_KEEP = 256;
const HASH_KEEP = 4096;
const MAX_TICKS_PER_FRAME = 4;
const TIMELINE_KEEP = 120;

export class Client {
  world: World;
  readonly inputs: Map<number, Command | null>[] = [];
  readonly contig: number[] = [];
  readonly peerAck: number[] = [];
  curTick = 0;
  /** Highest tick for which this client has sampled its own input. */
  sampledUpTo: number;
  pendingUser: Command | null = null;
  readonly hashes = new Map<number, number>();
  readonly states = new Map<number, World>();
  lastHashed = -1;
  stalled = false;
  readonly stats: ClientStats = {
    ticks: 0,
    stallMs: 0,
    rollbacks: 0,
    resimTicks: 0,
    maxRollback: 0,
    predictions: 0,
    mispredictions: 0,
    lagSum: 0,
    lagCount: 0,
  };
  readonly timeline: Bucket[] = [];

  private nextTickAt = 0;
  private lastTickWall = 0;
  private lastFrameAt = 0;
  nextFrameAt: number;
  private lastSent = -Infinity;
  private readonly frameRandom: () => number;
  private readonly sampleWall = new Map<number, number>();
  // Rollback bookkeeping, keyed by tick: the state before the tick, the inputs it ran with, its dt.
  private readonly snapshots = new Map<number, World>();
  private readonly used = new Map<number, Array<Command | null>>();
  private readonly dtUsed = new Map<number, number>();
  private pendingRollback: number | null = null;

  constructor(
    readonly profile: ClientProfile,
    private readonly cfg: SessionConfig,
    private readonly net: FakeNetwork<Payload>,
  ) {
    const i = profile.index;
    this.world = createWorld(
      { players: cfg.players, unitsPerPlayer: cfg.unitsPerPlayer, rngSeed: profile.rngSeed, localPlayer: i },
      profile.arith,
    );
    for (let p = 0; p < cfg.players; p++) {
      const m = new Map<number, Command | null>();
      // Nobody can have sent input for the first inputDelay ticks: they are empty by agreement.
      for (let t = 0; t < cfg.inputDelay; t++) m.set(t, null);
      this.inputs.push(m);
      this.contig.push(cfg.inputDelay - 1);
      this.peerAck.push(-1);
    }
    this.sampledUpTo = cfg.inputDelay - 1;
    this.frameRandom = makeRandom(hashInts(cfg.seed, i, 0xf7a3e));
    this.nextFrameAt = profile.frameMs * this.frameRandom();
  }

  get index(): number {
    return this.profile.index;
  }

  /** Highest tick for which every player's input is known (not predicted). */
  confirmed(): number {
    return Math.min(...this.contig);
  }

  receive(from: number, p: Payload): void {
    this.peerAck[from] = Math.max(this.peerAck[from] as number, p.ack);
    const mine = this.inputs[from] as Map<number, Command | null>;
    for (const [tick, cmd] of p.inputs) {
      if (mine.has(tick)) continue;
      mine.set(tick, cmd);
      if (this.cfg.mode === 'rollback' && tick < this.curTick) {
        const used = this.used.get(tick)?.[from] ?? null;
        if (!sameCommand(used, cmd)) {
          this.stats.mispredictions++;
          this.pendingRollback = Math.min(this.pendingRollback ?? tick, tick);
        }
      }
    }
    let c = this.contig[from] as number;
    while (mine.has(c + 1)) c++;
    this.contig[from] = c;
  }

  frame(now: number): void {
    const frameDt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    this.nextFrameAt += this.profile.frameMs * (0.9 + 0.2 * this.frameRandom());
    const bucket = this.bucket(now);

    if (this.pendingRollback !== null) this.rollback(bucket);

    let ran = 0;
    this.stalled = false;
    while (now >= this.nextTickAt && ran < MAX_TICKS_PER_FRAME) {
      const t = this.curTick;
      if (this.cfg.mode === 'rollback' && t - this.confirmed() > this.cfg.maxPrediction) {
        this.stall(now, frameDt, bucket);
        break;
      }
      this.sampleThrough(t + this.cfg.inputDelay, now);
      let inputs: Array<Command | null>;
      if (this.cfg.mode === 'lockstep') {
        if (this.inputs.some((m) => !m.has(t))) {
          this.stall(now, frameDt, bucket);
          break;
        }
        inputs = this.inputs.map((m) => m.get(t) as Command | null);
      } else {
        inputs = this.inputs.map((m) => {
          if (m.has(t)) return m.get(t) as Command | null;
          this.stats.predictions++;
          return null; // predict "no new command"
        });
      }
      const dt = this.cfg.nondet.frameDt ? Math.max(1, now - this.lastTickWall) : this.cfg.tickMs;
      this.lastTickWall = now;
      if (this.cfg.mode === 'rollback') {
        this.snapshots.set(t, cloneWorld(this.world));
        this.used.set(t, inputs);
        this.dtUsed.set(t, dt);
      }
      step(this.world, inputs, dt, { arith: this.profile.arith, order: this.profile.order });
      this.curTick++;
      this.stats.ticks++;
      bucket.ticks++;
      const sampled = this.sampleWall.get(t);
      if (sampled !== undefined) {
        this.stats.lagSum += now - sampled;
        this.stats.lagCount++;
        this.sampleWall.delete(t);
      }
      if (this.cfg.mode === 'lockstep') this.record(t, this.world);
      this.nextTickAt += this.cfg.tickMs;
      ran++;
    }
    if (this.cfg.mode === 'rollback') this.recordConfirmed();
  }

  private stall(now: number, frameDt: number, bucket: Bucket): void {
    this.stalled = true;
    // The game clock waits too: time spent stalled is lost, not caught up later.
    this.nextTickAt = now;
    this.stats.stallMs += frameDt;
    bucket.stallMs += frameDt;
    // Our packets may have been lost: resend at most once per tick while waiting.
    if (now - this.lastSent >= this.cfg.tickMs) this.sendAll(now);
  }

  private sampleThrough(tick: number, now: number): void {
    if (this.sampledUpTo >= tick) return;
    const me = this.index;
    const mine = this.inputs[me] as Map<number, Command | null>;
    while (this.sampledUpTo < tick) {
      const s = ++this.sampledUpTo;
      const cmd = this.pendingUser ?? (this.cfg.bots ? botCommand(this.cfg.seed, me, s) : null);
      this.pendingUser = null;
      mine.set(s, cmd);
      this.sampleWall.set(s, now);
    }
    this.contig[me] = this.sampledUpTo;
    this.sendAll(now);
  }

  private sendAll(now: number): void {
    this.lastSent = now;
    const mine = this.inputs[this.index] as Map<number, Command | null>;
    for (let q = 0; q < this.cfg.players; q++) {
      if (q === this.index) continue;
      const from = Math.max((this.peerAck[q] as number) + 1, this.sampledUpTo - 63, 0);
      const inputs: Array<[number, Command | null]> = [];
      for (let t = from; t <= this.sampledUpTo; t++) inputs.push([t, mine.get(t) ?? null]);
      this.net.send(this.index, q, now, { inputs, ack: this.contig[q] as number });
    }
  }

  private rollback(bucket: Bucket): void {
    const r = this.pendingRollback as number;
    this.pendingRollback = null;
    const snap = this.snapshots.get(r);
    if (!snap) return;
    this.world = cloneWorld(snap);
    const depth = this.curTick - r;
    for (let t = r; t < this.curTick; t++) {
      const inputs = this.inputs.map((m) => (m.has(t) ? (m.get(t) as Command | null) : null));
      if (t > r) this.snapshots.set(t, cloneWorld(this.world));
      this.used.set(t, inputs);
      step(this.world, inputs, this.dtUsed.get(t) as number, { arith: this.profile.arith, order: this.profile.order });
    }
    this.stats.rollbacks++;
    this.stats.resimTicks += depth;
    this.stats.maxRollback = Math.max(this.stats.maxRollback, depth);
    bucket.rollbacks++;
    bucket.resimTicks += depth;
  }

  private recordConfirmed(): void {
    const limit = Math.min(this.confirmed(), this.curTick - 1);
    for (let t = this.lastHashed + 1; t <= limit; t++) {
      const after = t + 1 === this.curTick ? this.world : (this.snapshots.get(t + 1) as World);
      this.record(t, after);
      this.snapshots.delete(t);
      this.used.delete(t);
      this.dtUsed.delete(t);
    }
  }

  private record(t: number, state: World): void {
    this.hashes.set(t, hashWorld(state, this.profile.arith));
    this.states.set(t, cloneWorld(state));
    this.states.delete(t - STATE_KEEP);
    this.hashes.delete(t - HASH_KEEP);
    this.lastHashed = t;
  }

  private bucket(now: number): Bucket {
    const second = Math.floor(now / 1000);
    let b = this.timeline[this.timeline.length - 1];
    if (!b || b.second !== second) {
      b = { second, stallMs: 0, resimTicks: 0, rollbacks: 0, ticks: 0 };
      this.timeline.push(b);
      if (this.timeline.length > TIMELINE_KEEP) this.timeline.shift();
    }
    return b;
  }
}

export interface Desync {
  tick: number;
  /** The client whose hash first disagreed with client 0. */
  client: number;
  hashes: number[];
  diff: WorldDiff | null;
}

export interface Comparison {
  tick: number;
  match: boolean;
}

const COMPARE_KEEP = 240;

/** All clients plus the network, advanced together in 1 ms steps. */
export class Session {
  readonly clients: Client[] = [];
  readonly net: FakeNetwork<Payload>;
  now = 0;
  desync: Desync | null = null;
  /** The most recent per-tick hash comparisons, oldest first. */
  readonly recent: Comparison[] = [];
  compared = 0;

  constructor(readonly config: SessionConfig) {
    this.net = new FakeNetwork<Payload>({ ...config.net }, config.seed);
    for (let i = 0; i < config.players; i++) this.clients.push(new Client(clientProfile(config, i), config, this.net));
  }

  /** Queues a command from player `player`, sampled on that player's next input tick. */
  command(player: number, cmd: Command): void {
    const c = this.clients[player];
    if (c) c.pendingUser = cmd;
  }

  advance(ms: number): void {
    const end = this.now + ms;
    while (this.now < end) {
      this.now++;
      for (const p of this.net.deliver(this.now)) this.clients[p.to]?.receive(p.from, p.payload);
      for (const c of this.clients) if (this.now >= c.nextFrameAt) c.frame(this.now);
      this.compare();
    }
  }

  /** Runs until every client has confirmed `ticks` ticks (or `maxMs` of simulated time pass). */
  runTicks(ticks: number, maxMs = ticks * this.config.tickMs * 20): void {
    const stopAt = this.now + maxMs;
    while (this.compared < ticks && this.now < stopAt) this.advance(this.config.tickMs);
  }

  private compare(): void {
    // Lockstep clients can confirm several ticks in one frame, so keep comparing.
    for (;;) {
      const t = this.compared;
      const hs: number[] = [];
      for (const c of this.clients) {
        const h = c.hashes.get(t);
        if (h === undefined) return;
        hs.push(h);
      }
      const bad = hs.findIndex((h) => h !== hs[0]);
      this.recent.push({ tick: t, match: bad < 0 });
      if (this.recent.length > COMPARE_KEEP) this.recent.shift();
      if (bad >= 0 && !this.desync) {
        const a = this.clients[0] as Client;
        const b = this.clients[bad] as Client;
        const sa = a.states.get(t);
        const sb = b.states.get(t);
        this.desync = {
          tick: t,
          client: bad,
          hashes: hs,
          diff: sa && sb ? diffWorlds(sa, sb, a.profile.arith, b.profile.arith) : null,
        };
      }
      this.compared++;
    }
  }
}

export interface ClientSummary {
  avgLagMs: number;
  stallPct: number;
  resimPerTick: number;
  rollbacksPerSec: number;
  maxRollback: number;
  ticks: number;
}

export function summarize(c: Client, elapsedMs: number): ClientSummary {
  const s = c.stats;
  return {
    avgLagMs: s.lagCount ? s.lagSum / s.lagCount : 0,
    stallPct: elapsedMs ? (100 * s.stallMs) / elapsedMs : 0,
    resimPerTick: s.ticks ? s.resimTicks / s.ticks : 0,
    rollbacksPerSec: elapsedMs ? (1000 * s.rollbacks) / elapsedMs : 0,
    maxRollback: s.maxRollback,
    ticks: s.ticks,
  };
}
