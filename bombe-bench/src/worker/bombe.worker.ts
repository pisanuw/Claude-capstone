/// <reference lib="webworker" />
import { createBombeRun, type BombeOptions, type Stop } from '../core/bombe';

export type WorkerRequest = { type: 'run'; options: BombeOptions };
export type WorkerResponse =
  | { type: 'progress'; ordersDone: number; orders: number; configsDone: number; total: number; stopCount: number; currentOrder: string }
  | { type: 'done'; stops: Stop[]; stopCount: number; configsDone: number; ms: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'run') return;
  const t0 = performance.now();
  try {
    const run = createBombeRun(msg.options);
    const post = (r: WorkerResponse) => ctx.postMessage(r);
    const tick = () => {
      const current = run.orders[run.ordersDone]?.join(' ') ?? '';
      post({ type: 'progress', ordersDone: run.ordersDone, orders: run.orders.length, configsDone: run.configsDone, total: run.total, stopCount: run.stopCount, currentOrder: current });
      const more = run.next();
      if (more) setTimeout(tick, 0);
      else post({ type: 'done', stops: run.stops, stopCount: run.stopCount, configsDone: run.configsDone, ms: performance.now() - t0 });
    };
    tick();
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message } satisfies WorkerResponse);
  }
};
