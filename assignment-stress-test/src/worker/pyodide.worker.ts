/// <reference lib="webworker" />
/**
 * Runs the pytest harness in Pyodide. This worker is the sandbox: the AI's
 * code runs in WebAssembly in its own thread with no access to the page, and
 * the page kills the worker if a run exceeds its time limit.
 */
import { HARNESS_PY } from '../core/harness.js';

export const PYODIDE_VERSION = '0.26.4';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface Pyodide {
  loadPackage(names: string[]): Promise<void>;
  runPython(code: string): unknown;
  globals: { get(name: string): (arg: string) => string };
}

let ready: Promise<Pyodide> | null = null;

function boot(): Promise<Pyodide> {
  ready ??= (async () => {
    const mod = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as {
      loadPyodide(o: { indexURL: string }): Promise<Pyodide>;
    };
    const py = await mod.loadPyodide({ indexURL: INDEX_URL });
    await py.loadPackage(['pytest']);
    py.runPython(HARNESS_PY);
    return py;
  })();
  return ready;
}

self.onmessage = async (e: MessageEvent<{ id: number; payload?: string }>) => {
  const { id, payload } = e.data;
  try {
    const py = await boot();
    if (payload === undefined) {
      self.postMessage({ id, ok: true, out: '' });
      return;
    }
    const out = py.globals.get('run_suite')(payload);
    self.postMessage({ id, ok: true, out });
  } catch (err) {
    self.postMessage({ id, ok: false, out: err instanceof Error ? err.message : String(err) });
  }
};
