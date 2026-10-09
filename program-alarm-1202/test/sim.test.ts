import { describe, expect, it } from 'vitest';
import { CORE_SETS, JOB_TEMPLATES, VAC_AREAS, nominalDemandPerTick, template } from '../src/core/jobs';
import {
  DEFAULT_CONFIG,
  MAX_TICKS,
  compare,
  formatTime,
  initialState,
  run,
  step,
  summarize,
  type SimConfig,
} from '../src/core/sim';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ ...DEFAULT_CONFIG, ...over });

describe('job mix', () => {
  it('has the real AGC pool sizes', () => {
    expect(CORE_SETS).toBe(7);
    expect(VAC_AREAS).toBe(5);
  });

  it('puts the nominal load in the high 80s with the monitor and lower without', () => {
    expect(nominalDemandPerTick(true)).toBeCloseTo(86.5, 5);
    expect(nominalDemandPerTick(false)).toBeCloseTo(81, 5);
  });

  it('protects guidance and radar only', () => {
    expect(JOB_TEMPLATES.filter((t) => t.restartProtected).map((t) => t.id)).toEqual(['servicer', 'radar']);
    expect(template('servicer').priority).toBeGreaterThan(template('display').priority);
  });

  it('rejects unknown jobs', () => {
    expect(() => template('nope' as never)).toThrow(/unknown job/);
  });
});

describe('nominal descent', () => {
  it('lands softly with no steal under every scheduler', () => {
    for (const r of compare(0, true)) {
      expect(r.outcome.kind).toBe('landed');
      expect(r.alarms1201 + r.alarms1202).toBe(0);
      expect(r.misses).toBe(0);
      expect(r.maxStaleSeconds).toBeLessThanOrEqual(2);
    }
  });

  it('updates guidance every 2 s', () => {
    const s = run(cfg({ stealPct: 0 }));
    const gaps = s.guidanceTicks.slice(1).map((t, i) => t - s.guidanceTicks[i]);
    expect(new Set(gaps)).toEqual(new Set([20]));
  });

  it('is deterministic', () => {
    const a = summarize(cfg(), run(cfg()));
    const b = summarize(cfg(), run(cfg()));
    expect(a).toEqual(b);
  });
});

describe('the Apollo 11 scenario: 15% steal with the monitor display', () => {
  const [agc, halt, rr] = compare(15, true);

  it('raises 1202 alarms under the AGC Executive, restarts, and still lands', () => {
    expect(agc.alarms1202).toBeGreaterThanOrEqual(3);
    expect(agc.restarts).toBe(agc.alarms1201 + agc.alarms1202);
    expect(agc.misses).toBe(0);
    expect(agc.outcome.kind).toBe('landed');
  });

  it('does not alarm at the very start: the backlog has to build up first', () => {
    expect(agc.alarmTicks[0].tick).toBeGreaterThan(100);
  });

  it('aborts at the first alarm when overflow is fatal', () => {
    expect(halt.outcome.kind).toBe('aborted');
    expect(halt.alarms1201 + halt.alarms1202).toBe(1);
    expect(halt.outcome.tick).toBe(agc.alarmTicks[0].tick + 1);
  });

  it('misses guidance deadlines and fails to land softly under round-robin', () => {
    expect(rr.misses).toBeGreaterThan(10);
    expect(rr.restarts).toBe(0);
    expect(['hard', 'crashed']).toContain(rr.outcome.kind);
  });

  it('sheds display work, not guidance, when the AGC restarts', () => {
    const nominal = compare(0, true)[0];
    expect(agc.displaysCompleted).toBeLessThan(nominal.displaysCompleted);
    expect(agc.guidanceUpdates).toBe(nominal.guidanceUpdates);
  });
});

describe('load sensitivity', () => {
  it('fits 15% steal when the monitor is off', () => {
    for (const r of compare(15, false)) expect(r.outcome.kind).toBe('landed');
  });

  it('runs out of VAC areas first when display jobs starve at 20%', () => {
    const [agc] = compare(20, false);
    expect(agc.alarms1201).toBeGreaterThan(0);
    expect(agc.alarms1202).toBe(0);
    expect(agc.outcome.kind).toBe('landed');
  });

  it('crashes round-robin under heavy steal', () => {
    expect(compare(20, true)[2].outcome.kind).toBe('crashed');
  });

  it('keeps guidance on time at the maximum steal because protected work still fits', () => {
    const [agc, halt] = compare(30, true);
    expect(agc.misses).toBe(0);
    expect(agc.outcome.kind).toBe('landed');
    expect(halt.outcome.kind).toBe('aborted');
  });

  it('clamps out-of-range steal values', () => {
    const s = initialState();
    step(s, cfg({ stealPct: 150 }));
    expect(s.history[0].capacity).toBe(0);
    const s2 = initialState();
    step(s2, cfg({ stealPct: -20 }));
    expect(s2.history[0].capacity).toBe(100);
  });
});

describe('restart mechanics', () => {
  it('flushes unprotected jobs and keeps protected ones with their phase progress', () => {
    const s = initialState();
    const config = cfg();
    while (s.restarts === 0) step(s, config);
    const ev = s.events.find((e) => e.kind === 'restart');
    expect(ev?.text).toMatch(/flushed/);
    const restartedTick = s.tick - 1;
    expect(s.history[restartedTick].capacity).toBeCloseTo(85 - 60, 6);
    const restarted = s.jobs.filter((x) => x.restarted);
    expect(restarted.length).toBeGreaterThan(0);
    for (const j of restarted) expect(template(j.id).restartProtected).toBe(true);
    expect(s.jobs.some((j) => j.id === 'display' && j.restarted)).toBe(false);
  });

  it('never holds more slots than exist', () => {
    const s = initialState();
    while (!s.outcome) {
      step(s, cfg({ stealPct: 25, scheduler: 'round-robin' }));
      expect(s.jobs.length).toBeLessThanOrEqual(CORE_SETS);
      expect(s.jobs.filter((j) => j.vac !== null).length).toBeLessThanOrEqual(VAC_AREAS);
    }
    expect(s.events.some((e) => e.kind === 'drop')).toBe(true);
  });

  it('stops stepping once there is an outcome', () => {
    const s = run(cfg());
    const tick = s.tick;
    step(s, cfg());
    expect(s.tick).toBe(tick);
  });

  it('ends a halted run on the next step even if called directly', () => {
    const s = initialState();
    s.halted = true;
    step(s, cfg());
    expect(s.outcome?.kind).toBe('aborted');
  });

  it('times out when the run limit is reached while airborne', () => {
    const s = initialState();
    s.lander.altitude = 1e7;
    while (!s.outcome) step(s, cfg({ stealPct: 0 }));
    expect(s.outcome?.kind).toBe('timeout');
    expect(s.tick).toBe(MAX_TICKS);
  });

  it('honours a smaller tick budget in run()', () => {
    const s = run(cfg(), 50);
    expect(s.tick).toBe(50);
    expect(s.outcome).toBeNull();
  });

  it('logs late guidance with how late it was', () => {
    const s = run(cfg({ scheduler: 'round-robin', stealPct: 20 }));
    expect(s.events.find((e) => e.kind === 'late')?.text).toMatch(/past its deadline/);
  });

  it('turns the monitor job off when asked', () => {
    const s = run(cfg({ monitorOn: false, stealPct: 0 }));
    expect(s.completed.monitor).toBe(0);
    expect(s.completed.display).toBeGreaterThan(40);
  });
});

describe('formatTime', () => {
  it('formats ticks as mission seconds', () => {
    expect(formatTime(0)).toBe('T+0.0s');
    expect(formatTime(123)).toBe('T+12.3s');
  });
});
