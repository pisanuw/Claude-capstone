/** Shared types for scenarios, the simulation and its results. */

export type Direction = -1 | 0 | 1;

/** A passenger request: appears at `t` on floor `from`, wants to reach `to`.
 *  In disk scenarios `from === to` (the request is served when the head stops). */
export interface PassengerSpec {
  t: number;
  from: number;
  to: number;
}

/** Deterministic traffic generator, expanded by `expandScenario`. */
export interface TrafficGenerator {
  seed: number;
  count: number;
  /** Arrival window in ticks (inclusive start, inclusive end). */
  start: number;
  end: number;
  pattern: 'up-peak' | 'down-peak' | 'lunch' | 'interfloor';
  /** Floors used for the non-lobby end of a trip, inclusive. Defaults to the whole building above the lobby. */
  floorRange?: [number, number];
  /** Lobby floor for peaks (default 0). */
  lobby?: number;
}

/** A building scenario as written by an instructor (JSON). */
export interface BuildingScenarioSpec {
  kind?: 'building';
  id: string;
  name: string;
  description?: string;
  floors: number;
  cars?: number;
  capacity?: number;
  /** Ticks the doors stay open on a stop where someone boards or alights (default 2). */
  doorTime?: number;
  /** Ticks to simulate (default 1000). Passengers not delivered by then count as unserved. */
  maxTime?: number;
  /** Starting floor for every car, or one per car (default 0). */
  initialFloor?: number | number[];
  /** Direction a car reports before it has moved (default 1, up). */
  initialDirection?: -1 | 1;
  passengers?: PassengerSpec[];
  generate?: TrafficGenerator;
  /** Hidden grading scenario: the UI does not show the request list. */
  hidden?: boolean;
}

/** A disk-scheduling scenario: one head, requests as cylinder numbers. */
export interface DiskScenarioSpec {
  kind: 'disk';
  id: string;
  name: string;
  description?: string;
  cylinders: number;
  head: number;
  initialDirection?: -1 | 1;
  requests?: number[];
  generate?: { seed: number; count: number };
  hidden?: boolean;
}

export type ScenarioSpec = BuildingScenarioSpec | DiskScenarioSpec;

/** A fully expanded scenario, ready to simulate. */
export interface Scenario {
  kind: 'building' | 'disk';
  id: string;
  name: string;
  description: string;
  floors: number;
  cars: number;
  capacity: number;
  doorTime: number;
  maxTime: number;
  initialFloor: number[];
  initialDirection: -1 | 1;
  passengers: PassengerSpec[];
  hidden: boolean;
}

/** What a policy sees for one waiting group or one passenger aboard. */
export interface HallCall {
  floor: number;
  /** +1 going up, -1 going down, 0 for disk requests. */
  direction: Direction;
  /** How many passengers are waiting in this group. */
  count: number;
  /** Tick the oldest of them arrived. */
  since: number;
  /** Id of the oldest passenger in the group: breaks ties in arrival order. */
  seq: number;
}

export interface CarCall {
  floor: number;
  count: number;
  since: number;
  seq: number;
}

export interface CarView {
  id: number;
  floor: number;
  direction: Direction;
  target: number | null;
  capacity: number;
  /** Destinations of passengers aboard, one entry per distinct floor. */
  stops: CarCall[];
  load: number;
}

export interface PolicyState {
  time: number;
  floors: number;
  initialDirection: -1 | 1;
  cars: CarView[];
  hallCalls: HallCall[];
}

/** The student-written function: returns the next floor for `car`, or null to idle. */
export type DispatchFn = (car: CarView, state: PolicyState) => unknown;

export interface CarFrame {
  floor: number;
  direction: Direction;
  target: number | null;
  doors: boolean;
  load: number;
}

/** One tick of the simulation, for animation and the disk view. */
export interface Frame {
  t: number;
  cars: CarFrame[];
  /** Passengers waiting per floor. */
  waiting: number[];
}

export type SimEventType = 'request' | 'arrive' | 'board' | 'alight' | 'dispatch';

export interface SimEvent {
  t: number;
  type: SimEventType;
  car?: number;
  floor: number;
  passenger?: number;
  target?: number | null;
}

export interface PassengerResult extends PassengerSpec {
  id: number;
  boardedAt: number | null;
  alightedAt: number | null;
  car: number | null;
}

export interface Metrics {
  served: number;
  unserved: number;
  meanWait: number;
  p95Wait: number;
  maxWait: number;
  meanRide: number;
  meanTotal: number;
  /** Floors travelled by all cars (head movement, for disks). */
  energy: number;
  /** Tick the last passenger alighted, or maxTime if any were left. */
  finishTime: number;
  /** Number of stops with doors open. */
  stops: number;
}

export interface SimResult {
  scenario: Scenario;
  frames: Frame[];
  events: SimEvent[];
  passengers: PassengerResult[];
  metrics: Metrics;
  /** Policy return values that were ignored (non-integer, out of range, ...). */
  warnings: string[];
  /** Set when the policy threw; the run stops at that tick. */
  error: string | null;
  /** Number of times the policy was called. */
  decisions: number;
}
