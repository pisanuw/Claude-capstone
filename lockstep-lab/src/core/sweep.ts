import { type Mode, type SessionConfig, DETERMINISTIC, Session, summarize } from './session';

export interface SweepPoint {
  mode: Mode;
  inputDelay: number;
  /** Mean time from sampling a local input to the tick that executes it. */
  avgLagMs: number;
  /** Share of wall time a client spent stalled waiting for input. */
  stallPct: number;
  /** Ticks re-simulated per tick advanced (rollback cost). */
  resimPerTick: number;
  maxRollback: number;
}

/**
 * Runs both netcode models for every input delay on the same network and
 * scripted players, with all nondeterminism off, and averages over clients.
 */
export function sweepDelays(base: SessionConfig, delays: readonly number[], durationMs = 20_000): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (const mode of ['lockstep', 'rollback'] as const) {
    for (const inputDelay of delays) {
      const s = new Session({ ...base, mode, inputDelay, bots: true, nondet: { ...DETERMINISTIC } });
      s.advance(durationMs);
      const sums = s.clients.map((c) => summarize(c, s.now));
      const mean = (f: (x: (typeof sums)[number]) => number) => sums.reduce((a, x) => a + f(x), 0) / sums.length;
      out.push({
        mode,
        inputDelay,
        avgLagMs: mean((x) => x.avgLagMs),
        stallPct: mean((x) => x.stallPct),
        resimPerTick: mean((x) => x.resimPerTick),
        maxRollback: Math.max(...sums.map((x) => x.maxRollback)),
      });
    }
  }
  return out;
}
