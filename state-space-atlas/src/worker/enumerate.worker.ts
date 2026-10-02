/// <reference lib="webworker" />
import { enumerateGraph, packGraph } from '../core/enumerate';
import { createPuzzle } from '../core/factory';
import type { PuzzleDef } from '../core/puzzle';

export type WorkerRequest = { type: 'enumerate'; def: PuzzleDef };
export type WorkerResponse =
  | { type: 'progress'; discovered: number; expanded: number }
  | { type: 'done'; graph: ReturnType<typeof packGraph>; label: string; ms: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'enumerate') return;
  const t0 = performance.now();
  try {
    const puzzle = createPuzzle(msg.def);
    const g = enumerateGraph(puzzle, {
      onProgress: (discovered, expanded) => ctx.postMessage({ type: 'progress', discovered, expanded } satisfies WorkerResponse),
    });
    const graph = packGraph(g);
    const response: WorkerResponse = { type: 'done', graph, label: puzzle.label, ms: performance.now() - t0 };
    ctx.postMessage(response, [graph.adjStart.buffer, graph.adj.buffer, graph.goals.buffer, graph.distFromStart.buffer, graph.distToGoal.buffer]);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message } satisfies WorkerResponse);
  }
};
