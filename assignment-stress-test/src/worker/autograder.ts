/**
 * Page side of the Pyodide worker: one run at a time, a time limit per run,
 * and a fresh worker after a timeout (the only way to stop runaway code).
 */
import { parseHarnessOutput, type HarnessPayload } from '../core/harness.js';
import type { TestRun } from '../core/types.js';

export type AutograderState = 'idle' | 'loading' | 'ready' | 'failed';

export class BrowserAutograder {
  private worker: Worker | null = null;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  state: AutograderState = 'idle';

  constructor(
    private readonly timeoutMs = 20_000,
    private readonly onState: (s: AutograderState, detail?: string) => void = () => {},
  ) {}

  private spawn(): Worker {
    this.worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  private call(payload: string | undefined, timeoutMs: number): Promise<{ ok: boolean; out: string } | 'timeout'> {
    const w = this.worker ?? this.spawn();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        w.terminate();
        this.worker = null;
        resolve('timeout');
      }, timeoutMs);
      const onMsg = (e: MessageEvent<{ id: number; ok: boolean; out: string }>) => {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        resolve(e.data);
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ id, payload });
    });
  }

  /** Load Pyodide and pytest (about 10 MB, cached by the browser afterwards). */
  async warm(): Promise<boolean> {
    if (this.state === 'ready') return true;
    this.setState('loading');
    const r = await this.call(undefined, 120_000);
    if (r === 'timeout' || !r.ok) {
      this.setState('failed', r === 'timeout' ? 'Loading Pyodide timed out.' : r.out);
      return false;
    }
    this.setState('ready');
    return true;
  }

  private setState(s: AutograderState, detail?: string): void {
    this.state = s;
    this.onState(s, detail);
  }

  run = (payload: HarnessPayload): Promise<TestRun> => {
    const job = this.queue.then(async (): Promise<TestRun> => {
      if (!(await this.warm())) return { status: 'harness-error', results: [], log: 'Pyodide could not load.' };
      const r = await this.call(JSON.stringify(payload), this.timeoutMs);
      if (r === 'timeout') {
        this.setState('idle');
        return { status: 'timeout', results: [], log: `Stopped after ${this.timeoutMs / 1000} s (infinite loop or very slow code).` };
      }
      if (!r.ok) return { status: 'harness-error', results: [], log: r.out };
      return parseHarnessOutput(r.out);
    });
    this.queue = job.catch(() => undefined);
    return job;
  };
}
