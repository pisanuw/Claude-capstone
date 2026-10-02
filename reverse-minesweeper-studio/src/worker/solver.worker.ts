/// <reference lib="webworker" />
import type { Board } from '../core/board';
import { bestStart, suggestEdits } from '../core/suggest';

export type WorkerRequest = { id: number; kind: 'suggest' | 'bestStart'; board: Board };
export type WorkerResponse =
  | { id: number; kind: 'suggest'; suggestions: ReturnType<typeof suggestEdits> }
  | { id: number; kind: 'bestStart'; start: number }
  | { id: number; kind: 'error'; message: string };

// Suggestions re-solve the board once per candidate edit, so they run here,
// off the main thread, to keep painting smooth on large boards.
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, board } = event.data;
  let reply: WorkerResponse;
  try {
    reply =
      kind === 'suggest'
        ? { id, kind, suggestions: suggestEdits(board, 4) }
        : { id, kind, start: bestStart(board) };
  } catch (err) {
    reply = { id, kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};
