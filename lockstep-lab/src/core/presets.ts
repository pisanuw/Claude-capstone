import { type SessionConfig, DEFAULT_CONFIG, DETERMINISTIC } from './session';

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  config: SessionConfig;
}

function make(id: string, title: string, blurb: string, patch: Partial<SessionConfig>): Preset {
  return {
    id,
    title,
    blurb,
    config: {
      ...DEFAULT_CONFIG,
      ...patch,
      nondet: { ...DETERMINISTIC, ...patch.nondet },
      net: { ...DEFAULT_CONFIG.net, ...patch.net },
    },
  };
}

export const PRESETS: readonly Preset[] = [
  make(
    'sync',
    'In sync',
    'Fixed point, a shared seed, id-ordered iteration and a fixed tick. The hashes match on every tick, however bad the network gets.',
    {},
  ),
  make(
    'float',
    'One float, two platforms',
    'Same source, but client B keeps intermediates in extended precision and has a different libm. Watch one rounding difference grow.',
    { nondet: { ...DETERMINISTIC, arithmetic: 'float-mixed' } },
  ),
  make(
    'float-same',
    'Floats on identical machines',
    'float32 on both clients with the same evaluation rules and libm. It stays in sync: floats are deterministic, platforms are not.',
    { nondet: { ...DETERMINISTIC, arithmetic: 'float-same' } },
  ),
  make('rng', 'Unseeded RNG', 'Each client seeds its RNG from its own clock. The very first wander step disagrees.', {
    nondet: { ...DETERMINISTIC, unseededRng: true },
  }),
  make(
    'order',
    'Map iteration order',
    'Each client created its own units first, and the simulation iterates the Map. RNG draws and separation pushes happen in a different order.',
    { nondet: { ...DETERMINISTIC, insertionOrder: true } },
  ),
  make(
    'frame-dt',
    'Frame-rate physics',
    'A 60 Hz and a 144 Hz machine each advance by their measured frame time instead of the fixed tick.',
    { nondet: { ...DETERMINISTIC, frameDt: true } },
  ),
  make(
    'lockstep-bad',
    'Lockstep on a bad network',
    '120 ms latency, 60 ms jitter, 5% loss and only 2 ticks of input delay: both clients stall whenever the other is late.',
    { mode: 'lockstep', inputDelay: 2, net: { latencyMs: 120, jitterMs: 60, lossPct: 5, reorder: true } },
  ),
  make(
    'rollback-bad',
    'Rollback on the same network',
    'Same network, 1 tick of input delay: no stalls and low input lag, paid for with re-simulation when predictions are wrong.',
    { mode: 'rollback', inputDelay: 1, net: { latencyMs: 120, jitterMs: 60, lossPct: 5, reorder: true } },
  ),
];
