// Job templates for the simplified Executive.
//
// Units: one tick is 0.1 s of mission time and the computer can do 100 work
// units per tick when nothing steals cycles, so a 2 s guidance cycle is
// 2000 units. The numbers are chosen so the nominal duty cycle lands in the
// high 80s (as it did on Apollo 11) and a ~15% cycle steal pushes it past 100%.

export type JobId = 'servicer' | 'radar' | 'telemetry' | 'display' | 'monitor';

export interface JobTemplate {
  id: JobId;
  name: string;
  /** Short description shown in the job table. */
  role: string;
  /** Higher runs first under the priority Executive. */
  priority: number;
  periodTicks: number;
  /** First spawn tick; later spawns every periodTicks. */
  offsetTicks: number;
  /** Work units one instance needs. */
  work: number;
  /** FINDVAC jobs need a VAC area as well as a core set; NOVAC jobs only a core set. */
  needsVac: boolean;
  /** Restart-protected jobs are re-established from their phase table after a restart. */
  restartProtected: boolean;
  /** Number of restart phases; a restarted job resumes at its last completed phase. */
  phases: number;
}

export const TICK_SECONDS = 0.1;
export const UNITS_PER_TICK = 100;
export const CORE_SETS = 7;
export const VAC_AREAS = 5;

export const JOB_TEMPLATES: readonly JobTemplate[] = [
  {
    id: 'servicer',
    name: 'SERVICER',
    role: 'Landing guidance: reads state, computes the throttle and attitude command',
    priority: 30,
    periodTicks: 20,
    offsetTicks: 0,
    work: 1100,
    needsVac: true,
    restartProtected: true,
    phases: 4,
  },
  {
    id: 'radar',
    name: 'LR READ',
    role: 'Landing radar altitude and velocity processing',
    priority: 25,
    periodTicks: 20,
    offsetTicks: 0,
    work: 180,
    needsVac: true,
    restartProtected: true,
    phases: 1,
  },
  {
    id: 'telemetry',
    name: 'DOWNLINK',
    role: 'Telemetry list for Mission Control',
    priority: 15,
    periodTicks: 20,
    offsetTicks: 0,
    work: 140,
    needsVac: true,
    restartProtected: false,
    phases: 1,
  },
  {
    id: 'display',
    name: 'DSKY UPDATE',
    role: 'DSKY display refresh',
    priority: 12,
    periodTicks: 20,
    offsetTicks: 0,
    work: 200,
    needsVac: true,
    restartProtected: false,
    phases: 1,
  },
  {
    id: 'monitor',
    name: 'V16N68',
    role: 'Crew-requested monitor display (range, time to go, velocity)',
    priority: 10,
    periodTicks: 20,
    offsetTicks: 0,
    work: 110,
    needsVac: false,
    restartProtected: false,
    phases: 1,
  },
];

export function template(id: JobId): JobTemplate {
  const t = JOB_TEMPLATES.find((j) => j.id === id);
  if (!t) throw new Error(`unknown job ${id}`);
  return t;
}

/** Work units demanded per tick on average by the active job mix. */
export function nominalDemandPerTick(monitorOn: boolean): number {
  return JOB_TEMPLATES.filter((t) => monitorOn || t.id !== 'monitor').reduce(
    (sum, t) => sum + t.work / t.periodTicks,
    0,
  );
}
