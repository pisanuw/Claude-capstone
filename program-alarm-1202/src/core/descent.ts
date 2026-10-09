// A one-dimensional powered descent: altitude, vertical velocity, mass and
// fuel. The thrust is whatever the last completed SERVICER pass commanded, so
// when guidance goes stale the lander keeps flying the old command.

export const MOON_G = 1.62; // m/s^2
export const EXHAUST_VELOCITY = 3050; // m/s, roughly the LM descent engine
export const MAX_THRUST_ACCEL = 4.5; // m/s^2 at the starting mass
export const SAFE_TOUCHDOWN = 3; // m/s
export const HARD_TOUCHDOWN = 6; // m/s

export interface Lander {
  altitude: number; // m
  velocity: number; // m/s, negative is down
  dryMass: number; // kg
  fuel: number; // kg
  /** Commanded thrust force (N) held between guidance updates. */
  thrust: number;
}

export function initialLander(): Lander {
  const dryMass = 6800;
  const fuel = 520;
  return {
    altitude: 1500,
    velocity: -30,
    dryMass,
    fuel,
    thrust: (dryMass + fuel) * MOON_G,
  };
}

/** The descent profile guidance tries to follow: 30 m/s high up, then h/15, then 1 m/s. */
export function targetVelocity(altitude: number): number {
  return -Math.max(1, Math.min(30, altitude / 15));
}

export interface GuidanceInput {
  altitude: number;
  velocity: number;
  mass: number;
}

/** What one SERVICER pass computes from the state it read when it started. */
export function guidanceThrust(input: GuidanceInput): number {
  const vt = targetVelocity(input.altitude);
  // Feed-forward on the h/15 leg, where the target shrinks as we descend.
  const inExpLeg = input.altitude / 15 < 30 && input.altitude / 15 > 1;
  const ff = inExpLeg ? -input.velocity / 15 : 0;
  const accel = MOON_G + 0.35 * (vt - input.velocity) + ff;
  const maxForce = MAX_THRUST_ACCEL * 7320;
  return Math.max(0, Math.min(maxForce, accel * input.mass));
}

export function mass(l: Lander): number {
  return l.dryMass + l.fuel;
}

export function stepLander(l: Lander, dt: number): Lander {
  const m = mass(l);
  let thrust = l.fuel > 0 ? l.thrust : 0;
  let burn = (thrust / EXHAUST_VELOCITY) * dt;
  if (burn > l.fuel) {
    thrust *= l.fuel / burn;
    burn = l.fuel;
  }
  const accel = thrust / m - MOON_G;
  const velocity = l.velocity + accel * dt;
  const altitude = l.altitude + ((l.velocity + velocity) / 2) * dt;
  return { ...l, altitude, velocity, fuel: l.fuel - burn };
}

export type TouchdownKind = 'landed' | 'hard' | 'crashed';

export function classifyTouchdown(speed: number): TouchdownKind {
  if (speed <= SAFE_TOUCHDOWN) return 'landed';
  if (speed <= HARD_TOUCHDOWN) return 'hard';
  return 'crashed';
}
