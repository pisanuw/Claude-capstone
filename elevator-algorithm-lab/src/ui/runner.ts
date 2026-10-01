import type { Scenario, SimResult } from '../core/types';

export class RunTimeout extends Error {}

/**
 * Run a policy in a fresh Web Worker. A policy that loops forever is cut off
 * after `timeoutMs` by terminating the worker.
 */
export function runInWorker(scenario: Scenario, code: string, timeoutMs = 8000): Promise<SimResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    const id = Date.now();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new RunTimeout(`the policy did not finish within ${timeoutMs / 1000}s (an infinite loop?)`));
    }, timeoutMs);
    worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: SimResult; error?: string }>) => {
      if (ev.data.id !== id) return;
      clearTimeout(timer);
      worker.terminate();
      if (ev.data.ok && ev.data.result) resolve(ev.data.result);
      else reject(new Error(ev.data.error ?? 'unknown worker error'));
    };
    worker.onerror = (ev) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(ev.message || 'worker failed to start'));
    };
    worker.postMessage({ id, scenario, code });
  });
}
