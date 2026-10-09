// The Executive simulation: job spawning, core-set and VAC-area allocation,
// scheduling, the 1201/1202 alarms, restarts, and the guidance-to-lander loop.
// Pure and deterministic: the same config always produces the same run.

import {
  CORE_SETS,
  JOB_TEMPLATES,
  TICK_SECONDS,
  UNITS_PER_TICK,
  VAC_AREAS,
  template,
  type JobId,
  type JobTemplate,
} from './jobs';
import {
  classifyTouchdown,
  guidanceThrust,
  initialLander,
  mass,
  stepLander,
  targetVelocity,
  type GuidanceInput,
  type Lander,
  type TouchdownKind,
} from './descent';

export type SchedulerKind = 'agc' | 'halt' | 'round-robin';

export const SCHEDULERS: readonly { id: SchedulerKind; name: string; blurb: string }[] = [
  {
    id: 'agc',
    name: 'AGC Executive',
    blurb: 'Priority scheduling; an overflow raises 1201/1202 and a software restart re-establishes only restart-protected jobs.',
  },
  {
    id: 'halt',
    name: 'Priority, no restart',
    blurb: 'Same priorities, but an overflow is treated as fatal: the computer halts and the landing is aborted.',
  },
  {
    id: 'round-robin',
    name: 'Naive round-robin',
    blurb: 'Every job gets an equal share of the CPU; requests that find no free core set are silently dropped.',
  },
];

export interface SimConfig {
  scheduler: SchedulerKind;
  /** Percent of CPU cycles stolen by the rendezvous-radar counter interrupts (0-30). */
  stealPct: number;
  /** Whether the crew's Verb 16 Noun 68 monitor display is running. */
  monitorOn: boolean;
}

export const DEFAULT_CONFIG: SimConfig = { scheduler: 'agc', stealPct: 15, monitorOn: true };

/** Work units a software restart costs in the tick it happens. */
export const RESTART_COST = 60;
/** Hard stop so a hovering lander cannot run forever. */
export const MAX_TICKS = 3000;

export interface Job {
  uid: number;
  id: JobId;
  work: number;
  remaining: number;
  spawnedAt: number;
  deadline: number;
  startedAt: number | null;
  coreSet: number;
  vac: number | null;
  /** SERVICER only: the state it read when it started (its READACCS snapshot). */
  input: GuidanceInput | null;
  restarted: boolean;
}

export type EventKind =
  | 'alarm'
  | 'restart'
  | 'halt'
  | 'drop'
  | 'late'
  | 'touchdown';

export interface SimEvent {
  tick: number;
  kind: EventKind;
  code?: 1201 | 1202;
  job?: JobId;
  text: string;
}

export interface TickSample {
  altitude: number;
  velocity: number;
  target: number;
  capacity: number;
  used: number;
  coreSets: number;
  vacs: number;
}

export interface Outcome {
  kind: TouchdownKind | 'aborted' | 'timeout';
  tick: number;
  speed: number;
}

export interface SimState {
  tick: number;
  nextUid: number;
  jobs: Job[];
  lander: Lander;
  halted: boolean;
  outcome: Outcome | null;
  events: SimEvent[];
  history: TickSample[];
  guidanceTicks: number[];
  alarmTicks: { tick: number; code: 1201 | 1202 }[];
  restarts: number;
  misses: number;
  lastGuidanceTick: number;
  maxStaleTicks: number;
  completed: Record<JobId, number>;
}

export function initialState(): SimState {
  return {
    tick: 0,
    nextUid: 1,
    jobs: [],
    lander: initialLander(),
    halted: false,
    outcome: null,
    events: [],
    history: [],
    guidanceTicks: [],
    alarmTicks: [],
    restarts: 0,
    misses: 0,
    lastGuidanceTick: 0,
    maxStaleTicks: 0,
    completed: { servicer: 0, radar: 0, telemetry: 0, display: 0, monitor: 0 },
  };
}

export function formatTime(tick: number): string {
  return `T+${(tick * TICK_SECONDS).toFixed(1)}s`;
}

function freeIndex(used: Set<number>, total: number): number {
  for (let i = 0; i < total; i++) if (!used.has(i)) return i;
  return -1;
}

type Request = { ok: true; job: Job } | { ok: false; code: 1201 | 1202 };

function tryAllocate(s: SimState, t: JobTemplate, deadline: number): Request {
  const core = freeIndex(new Set(s.jobs.map((j) => j.coreSet)), CORE_SETS);
  if (core < 0) return { ok: false, code: 1202 };
  let vac: number | null = null;
  if (t.needsVac) {
    const usedVac = new Set(s.jobs.filter((j) => j.vac !== null).map((j) => j.vac as number));
    vac = freeIndex(usedVac, VAC_AREAS);
    if (vac < 0) return { ok: false, code: 1201 };
  }
  return {
    ok: true,
    job: {
      uid: s.nextUid++,
      id: t.id,
      work: t.work,
      remaining: t.work,
      spawnedAt: s.tick,
      deadline,
      startedAt: null,
      coreSet: core,
      vac,
      input: null,
      restarted: false,
    },
  };
}

/**
 * BAILOUT: flush every job, then re-establish the restart-protected ones from
 * their phase tables. A protected job resumes at the start of the phase it was
 * in, so completed phases are not redone.
 */
function restart(s: SimState, code: 1201 | 1202): void {
  const survivors = s.jobs.filter((j) => template(j.id).restartProtected);
  const dropped = s.jobs.length - survivors.length;
  s.jobs = [];
  for (const old of survivors) {
    const t = template(old.id);
    const phaseSize = t.work / t.phases;
    const donePhases = Math.floor((t.work - old.remaining) / phaseSize);
    const req = tryAllocate(s, t, old.deadline);
    /* c8 ignore next -- protected jobs always fit in an empty Executive */
    if (!req.ok) continue;
    req.job.remaining = t.work - donePhases * phaseSize;
    req.job.spawnedAt = old.spawnedAt;
    req.job.startedAt = old.startedAt;
    req.job.input = old.input;
    req.job.restarted = true;
    s.jobs.push(req.job);
  }
  s.restarts++;
  s.events.push({
    tick: s.tick,
    kind: 'restart',
    code,
    text: `Software restart: ${dropped} unprotected job${dropped === 1 ? '' : 's'} flushed, ${survivors.length} protected job${survivors.length === 1 ? '' : 's'} re-established. Guidance keeps its place.`,
  });
}

function request(s: SimState, t: JobTemplate, config: SimConfig): boolean {
  const deadline = s.tick + t.periodTicks;
  let req = tryAllocate(s, t, deadline);
  if (req.ok) {
    s.jobs.push(req.job);
    return false;
  }
  const code = req.code;
  s.alarmTicks.push({ tick: s.tick, code });
  const what = code === 1202 ? 'no core sets left' : 'no VAC areas left';
  s.events.push({
    tick: s.tick,
    kind: 'alarm',
    code,
    job: t.id,
    text: `PROG ${code}: ${t.name} requested a job slot and found ${what} (Executive overflow).`,
  });
  if (config.scheduler === 'agc') {
    restart(s, code);
    req = tryAllocate(s, t, deadline);
    /* c8 ignore next -- after a flush there is always room */
    if (req.ok) s.jobs.push(req.job);
    return true;
  }
  if (config.scheduler === 'halt') {
    s.halted = true;
    s.events.push({
      tick: s.tick,
      kind: 'halt',
      code,
      text: `Computer halted on alarm ${code}. With no guidance the landing must be aborted.`,
    });
    return false;
  }
  s.events.push({
    tick: s.tick,
    kind: 'drop',
    job: t.id,
    text: `${t.name} request dropped: no restart logic, so the overflow is ignored and the job never runs.`,
  });
  if (t.id === 'servicer') s.misses++;
  return false;
}

/** Hands out this tick's capacity. Returns the units actually used. */
function schedule(s: SimState, capacity: number, kind: SchedulerKind): number {
  let left = capacity;
  const runnable = s.jobs.filter((j) => j.remaining > 0);
  if (kind === 'round-robin') {
    let active = runnable;
    while (left > 1e-9 && active.length > 0) {
      const share = left / active.length;
      for (const j of active) {
        const give = Math.min(share, j.remaining);
        j.remaining -= give;
        left -= give;
      }
      active = active.filter((j) => j.remaining > 1e-9);
    }
  } else {
    runnable.sort((a, b) => template(b.id).priority - template(a.id).priority || a.uid - b.uid);
    for (const j of runnable) {
      if (left <= 0) break;
      const give = Math.min(left, j.remaining);
      j.remaining -= give;
      left -= give;
    }
  }
  for (const j of runnable) {
    if (j.startedAt === null && j.remaining < j.work) {
      j.startedAt = s.tick;
    }
  }
  return capacity - left;
}

function snapshot(l: Lander): GuidanceInput {
  return { altitude: l.altitude, velocity: l.velocity, mass: mass(l) };
}

/** Advance one tick. Mutates and returns the state; config may change between ticks. */
export function step(s: SimState, config: SimConfig): SimState {
  if (s.outcome) return s;
  if (s.halted) {
    s.outcome = { kind: 'aborted', tick: s.tick, speed: Math.abs(s.lander.velocity) };
    return s;
  }
  let restarted = false;
  for (const t of JOB_TEMPLATES) {
    if (t.id === 'monitor' && !config.monitorOn) continue;
    if (s.tick < t.offsetTicks || (s.tick - t.offsetTicks) % t.periodTicks !== 0) continue;
    restarted = request(s, t, config) || restarted;
    if (s.halted) break;
  }
  const steal = Math.max(0, Math.min(100, config.stealPct)) / 100;
  const capacity = Math.max(0, UNITS_PER_TICK * (1 - steal) - (restarted ? RESTART_COST : 0));
  // SERVICER reads the vehicle state the moment it first gets the CPU.
  const before = new Map(s.jobs.map((j) => [j.uid, j.startedAt]));
  const used = s.halted ? 0 : schedule(s, capacity, config.scheduler);
  for (const j of s.jobs) {
    if (j.id === 'servicer' && before.get(j.uid) === null && j.startedAt !== null) {
      j.input = snapshot(s.lander);
    }
  }
  const finished = s.jobs.filter((j) => j.remaining <= 1e-9);
  s.jobs = s.jobs.filter((j) => j.remaining > 1e-9);
  for (const j of finished) {
    s.completed[j.id]++;
    if (j.id !== 'servicer') continue;
    /* c8 ignore next -- a finished job has always started */
    s.lander.thrust = guidanceThrust(j.input ?? snapshot(s.lander));
    s.guidanceTicks.push(s.tick);
    s.lastGuidanceTick = s.tick;
    if (s.tick >= j.deadline) {
      s.misses++;
      s.events.push({
        tick: s.tick,
        kind: 'late',
        job: 'servicer',
        text: `SERVICER finished ${((s.tick - j.deadline) * TICK_SECONDS).toFixed(1)} s past its deadline; the throttle ran on a stale command.`,
      });
    }
  }
  s.maxStaleTicks = Math.max(s.maxStaleTicks, s.tick - s.lastGuidanceTick);

  s.lander = stepLander(s.lander, TICK_SECONDS);
  s.history.push({
    altitude: Math.max(0, s.lander.altitude),
    velocity: s.lander.velocity,
    target: targetVelocity(Math.max(0, s.lander.altitude)),
    capacity,
    used,
    coreSets: s.jobs.length,
    vacs: s.jobs.filter((j) => j.vac !== null).length,
  });
  s.tick++;

  if (s.lander.altitude <= 0) {
    const speed = Math.abs(s.lander.velocity);
    const kind = classifyTouchdown(speed);
    s.lander = { ...s.lander, altitude: 0 };
    s.outcome = { kind, tick: s.tick, speed };
    const verdict =
      kind === 'landed' ? 'Contact light. The Eagle has landed.' : kind === 'hard' ? 'Hard landing: gear damage likely.' : 'Impact: the lander crashed.';
    s.events.push({ tick: s.tick, kind: 'touchdown', text: `Touchdown at ${speed.toFixed(1)} m/s. ${verdict}` });
  } else if (s.halted) {
    s.outcome = { kind: 'aborted', tick: s.tick, speed: Math.abs(s.lander.velocity) };
  } else if (s.tick >= MAX_TICKS) {
    s.outcome = { kind: 'timeout', tick: s.tick, speed: Math.abs(s.lander.velocity) };
  }
  return s;
}

export function run(config: SimConfig, maxTicks = MAX_TICKS): SimState {
  const s = initialState();
  while (!s.outcome && s.tick < maxTicks) step(s, config);
  return s;
}

export interface RunSummary {
  scheduler: SchedulerKind;
  outcome: Outcome;
  alarms1201: number;
  alarms1202: number;
  restarts: number;
  misses: number;
  maxStaleSeconds: number;
  guidanceUpdates: number;
  guidanceTicks: number[];
  alarmTicks: { tick: number; code: 1201 | 1202 }[];
  displaysCompleted: number;
}

export function summarize(config: SimConfig, s: SimState): RunSummary {
  /* c8 ignore next -- run() always ends with an outcome */
  const outcome = s.outcome ?? { kind: 'timeout', tick: s.tick, speed: Math.abs(s.lander.velocity) };
  return {
    scheduler: config.scheduler,
    outcome,
    alarms1201: s.alarmTicks.filter((a) => a.code === 1201).length,
    alarms1202: s.alarmTicks.filter((a) => a.code === 1202).length,
    restarts: s.restarts,
    misses: s.misses,
    maxStaleSeconds: s.maxStaleTicks * TICK_SECONDS,
    guidanceUpdates: s.guidanceTicks.length,
    guidanceTicks: s.guidanceTicks,
    alarmTicks: s.alarmTicks,
    displaysCompleted: s.completed.display + s.completed.monitor,
  };
}

/** Runs the same load under every scheduler. */
export function compare(stealPct: number, monitorOn: boolean): RunSummary[] {
  return SCHEDULERS.map(({ id }) => {
    const config: SimConfig = { scheduler: id, stealPct, monitorOn };
    return summarize(config, run(config));
  });
}
