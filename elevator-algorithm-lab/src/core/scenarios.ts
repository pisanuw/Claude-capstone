import type { ScenarioSpec } from './types';

/** Built-in scenarios. Instructors can paste any of these as a starting point. */
export const SCENARIOS: ScenarioSpec[] = [
  {
    kind: 'disk',
    id: 'textbook-disk',
    name: 'Textbook disk trace',
    description:
      'The classic operating-systems example: a 200-cylinder disk, head at 53 moving toward 0, queue 98, 183, 37, 122, 14, 124, 65, 67. FCFS moves 640 cylinders, SSTF and SCAN 236, LOOK 208.',
    cylinders: 200,
    head: 53,
    initialDirection: -1,
    requests: [98, 183, 37, 122, 14, 124, 65, 67],
  },
  {
    id: 'morning-rush',
    name: 'Morning rush',
    description:
      'Everyone arrives in the lobby within four minutes and wants a different floor. Two cars, eight people each. Watch how much a sweep policy saves on energy.',
    floors: 20,
    cars: 2,
    capacity: 8,
    doorTime: 2,
    maxTime: 900,
    generate: { seed: 20260929, count: 90, start: 0, end: 240, pattern: 'up-peak' },
  },
  {
    id: 'lunch-spike',
    name: 'Lunch spike',
    description:
      'Half the building heads down to the lobby while the other half comes back up, all within two and a half minutes. Three cars.',
    floors: 20,
    cars: 3,
    capacity: 8,
    doorTime: 2,
    maxTime: 900,
    initialFloor: [0, 10, 19],
    generate: { seed: 1203, count: 120, start: 0, end: 150, pattern: 'lunch' },
  },
  {
    id: 'starvation-trap',
    name: 'Starvation trap',
    description:
      'One person on floor 1 wants the lobby. Meanwhile a steady stream of people (one every three seconds, all run long) ride between floors 30 and 40. The one car starts on floor 35. SSTF never comes down.',
    floors: 41,
    cars: 1,
    capacity: 10,
    doorTime: 2,
    maxTime: 1200,
    initialFloor: 35,
    passengers: [{ t: 6, from: 1, to: 0 }],
    generate: { seed: 77, count: 380, start: 0, end: 1140, pattern: 'interfloor', floorRange: [30, 40] },
  },
  {
    id: 'quiet-evening',
    name: 'Quiet evening',
    description: 'Twenty-five scattered trips over ten minutes in a twelve-floor building with one car. Policies barely differ here; use it to check a new policy runs at all.',
    floors: 12,
    cars: 1,
    capacity: 6,
    doorTime: 2,
    maxTime: 900,
    generate: { seed: 5, count: 25, start: 0, end: 600, pattern: 'interfloor', floorRange: [0, 11] },
  },
  {
    kind: 'disk',
    id: 'cylinder-storm',
    name: 'Cylinder storm',
    description: 'Sixty random requests on a 200-cylinder disk, head at 100 moving up. Compare total head movement and the response-time tail.',
    cylinders: 200,
    head: 100,
    initialDirection: 1,
    generate: { seed: 4242, count: 60 },
  },
];

export function scenarioSpecById(id: string): ScenarioSpec | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
