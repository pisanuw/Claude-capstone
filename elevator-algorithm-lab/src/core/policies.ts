/**
 * Built-in dispatch policies, kept as JavaScript source so students read the
 * same code the simulator runs and can start editing from any of them.
 */

export interface PolicyPreset {
  id: string;
  name: string;
  summary: string;
  source: string;
}

/**
 * Helpers available inside every policy. Prepended to the student's code by
 * `compilePolicy`, and shown verbatim in the UI's API panel.
 */
export const PRELUDE = `// --- helpers available to every policy ---
// pending(car, state): every floor this car has a reason to visit:
//   hall calls (people waiting) and car calls (people aboard), as
//   { floor, since, seq, kind: 'hall' | 'car', count }. 'since' is the
//   tick the oldest request arrived; 'seq' breaks ties in arrival order.
//   Hall calls are left out when the car is full, and the simulator hides
//   hall calls on the car's own floor that it could not take just now
//   (going the other way).
function pending(car, state) {
  const list = [];
  if (car.load < car.capacity) for (const h of state.hallCalls) list.push({ floor: h.floor, since: h.since, seq: h.seq, kind: 'hall', count: h.count });
  for (const s of car.stops) list.push({ floor: s.floor, since: s.since, seq: s.seq, kind: 'car', count: s.count });
  return list;
}
// nearest(floor, list): the entry closest to floor (ties: lower floor).
function nearest(floor, list) {
  let best = null;
  for (const r of list) {
    if (best === null || Math.abs(r.floor - floor) < Math.abs(best.floor - floor)) best = r;
  }
  return best;
}
// heading(car, state): the car's direction, or the scenario's initial one
// before it has moved.
function heading(car, state) {
  return car.direction === 0 ? state.initialDirection : car.direction;
}
`;

const FCFS = `// FCFS: first come, first served.
// Go to the oldest outstanding request, wherever it is.
function dispatch(car, state) {
  const reqs = pending(car, state);
  if (reqs.length === 0) return null;
  reqs.sort((a, b) => a.since - b.since || a.seq - b.seq);
  return reqs[0].floor;
}
`;

const SSTF = `// SSTF: shortest seek time first.
// Always serve the closest request. Fast on average, but a request far
// away can wait forever while nearby ones keep arriving (starvation).
function dispatch(car, state) {
  const reqs = pending(car, state);
  if (reqs.length === 0) return null;
  return nearest(car.floor, reqs).floor;
}
`;

const SCAN = `// SCAN: the elevator algorithm.
// Keep moving in one direction, serving requests on the way, all the way
// to the end of the building (or disk). Then turn around.
function dispatch(car, state) {
  const reqs = pending(car, state);
  if (reqs.length === 0) return null;
  const dir = heading(car, state);
  const top = state.floors - 1;
  const ahead = reqs.filter((r) => Math.sign(r.floor - car.floor) === dir);
  if (ahead.length > 0) return nearest(car.floor, ahead).floor;
  // Nothing ahead: finish the sweep to the end floor, then come back.
  const end = dir > 0 ? top : 0;
  if (car.floor !== end) return end;
  const back = nearest(car.floor, reqs.filter((r) => r.floor !== car.floor));
  return back ? back.floor : null;
}
`;

const LOOK = `// LOOK: SCAN without the empty trip to the end.
// Keep going in one direction while there is a request ahead; otherwise
// reverse immediately.
function dispatch(car, state) {
  const reqs = pending(car, state);
  if (reqs.length === 0) return null;
  const dir = heading(car, state);
  const ahead = reqs.filter((r) => Math.sign(r.floor - car.floor) === dir);
  if (ahead.length > 0) return nearest(car.floor, ahead).floor;
  const back = nearest(car.floor, reqs.filter((r) => r.floor !== car.floor));
  return back ? back.floor : null;
}
`;

const CLOOK = `// C-LOOK: circular LOOK.
// Serve requests in one direction only; when none are ahead, jump to the
// farthest request behind and sweep the same way again. Fairer p95 than
// LOOK on disks. The sweep direction is kept in a variable outside
// dispatch, so it survives the jump (which travels the other way).
let sweep = 0;
function dispatch(car, state) {
  const reqs = pending(car, state);
  if (reqs.length === 0) return null;
  if (sweep === 0) sweep = heading(car, state);
  const ahead = reqs.filter((r) => Math.sign(r.floor - car.floor) === sweep);
  if (ahead.length > 0) return nearest(car.floor, ahead).floor;
  // Wrap around: the request farthest behind us.
  let far = null;
  for (const r of reqs) {
    if (r.floor === car.floor) continue;
    if (far === null || Math.abs(r.floor - car.floor) > Math.abs(far.floor - car.floor)) far = r;
  }
  return far ? far.floor : null;
}
`;

const ZONED_LOOK = `// Zoned LOOK for several cars.
// Each car owns a slice of the building for hall calls (car 0 the lowest
// floors), runs LOOK inside it, and always drops off its own passengers.
// Try removing the zone filter to watch all cars chase the same call.
function dispatch(car, state) {
  const n = state.cars.length;
  const zone = Math.ceil(state.floors / n);
  const lo = car.id * zone;
  const hi = Math.min(state.floors - 1, lo + zone - 1);
  const reqs = pending(car, state).filter(
    (r) => r.kind === 'car' || (r.floor >= lo && r.floor <= hi),
  );
  if (reqs.length === 0) return null;
  const dir = heading(car, state);
  const ahead = reqs.filter((r) => Math.sign(r.floor - car.floor) === dir);
  if (ahead.length > 0) return nearest(car.floor, ahead).floor;
  const back = nearest(car.floor, reqs.filter((r) => r.floor !== car.floor));
  return back ? back.floor : null;
}
`;

export const POLICIES: PolicyPreset[] = [
  { id: 'fcfs', name: 'FCFS', summary: 'Oldest request first.', source: FCFS },
  { id: 'sstf', name: 'SSTF', summary: 'Closest request first.', source: SSTF },
  { id: 'scan', name: 'SCAN', summary: 'Sweep to each end of the building.', source: SCAN },
  { id: 'look', name: 'LOOK', summary: 'Sweep, reversing at the last request.', source: LOOK },
  { id: 'clook', name: 'C-LOOK', summary: 'One-way sweep, then jump back.', source: CLOOK },
  { id: 'zoned', name: 'Zoned LOOK', summary: 'Each car owns a slice of floors.', source: ZONED_LOOK },
];

export function policyById(id: string): PolicyPreset | undefined {
  return POLICIES.find((p) => p.id === id);
}
