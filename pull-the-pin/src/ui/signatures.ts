// Runs the fault-signature tables in a worker so the page stays responsive,
// falling back to the main thread where workers are unavailable.

import { Diagnoser, computeSignatures, programKey } from '../core/diagnosis';

export class SignatureService {
  readonly diagnoser = new Diagnoser();
  private readonly pending = new Map<string, Promise<void>>();
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly waiting = new Map<number, { resolve: (t: Uint32Array) => void; progress: (p: number) => void }>();
  private progressByKey = new Map<string, number>();
  onProgress: () => void = () => {};

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; table?: Uint32Array }>) => {
        const w = this.waiting.get(e.data.id);
        if (!w) return;
        if (e.data.table) {
          this.waiting.delete(e.data.id);
          w.resolve(e.data.table);
        } else if (e.data.progress !== undefined) w.progress(e.data.progress);
      };
      this.worker.onerror = () => (this.worker = null);
    } catch {
      this.worker = null;
    }
  }

  ready(bytes: readonly number[]): boolean {
    return this.diagnoser.has(bytes);
  }

  /** Fraction done for a program still being analyzed. */
  progress(bytes: readonly number[]): number {
    return this.ready(bytes) ? 1 : (this.progressByKey.get(programKey(bytes)) ?? 0);
  }

  ensure(bytes: readonly number[]): Promise<void> {
    const key = programKey(bytes);
    if (this.diagnoser.has(bytes)) return Promise.resolve();
    const existing = this.pending.get(key);
    if (existing) return existing;
    const job = this.compute(bytes, (p) => {
      this.progressByKey.set(key, p);
      this.onProgress();
    }).then((table) => {
      this.diagnoser.store(bytes, table);
      this.pending.delete(key);
      this.onProgress();
    });
    this.pending.set(key, job);
    return job;
  }

  private compute(bytes: readonly number[], progress: (p: number) => void): Promise<Uint32Array> {
    if (this.worker) {
      const id = this.nextId++;
      return new Promise((resolve) => {
        this.waiting.set(id, { resolve, progress });
        this.worker!.postMessage({ id, bytes: [...bytes] });
      });
    }
    return new Promise((resolve) => setTimeout(() => resolve(computeSignatures(bytes)), 0));
  }
}
