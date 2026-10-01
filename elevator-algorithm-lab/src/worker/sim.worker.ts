/// <reference lib="webworker" />
// Runs a student policy against a scenario off the main thread so an
// infinite loop can be killed by terminating the worker.
import { compilePolicy } from '../core/compile';
import { simulate } from '../core/sim';
import type { Scenario } from '../core/types';

export interface RunRequest {
  id: number;
  scenario: Scenario;
  code: string;
}

self.onmessage = (ev: MessageEvent<RunRequest>) => {
  const { id, scenario, code } = ev.data;
  try {
    const dispatch = compilePolicy(code);
    const result = simulate(scenario, dispatch);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
