/// <reference lib="webworker" />
import { analyze } from './core/analyze';
import type { AnalyzeRequest, AnalyzeResponse } from './core/types';

// The compiler runs here so a big snippet can never freeze the page. Each
// request is tagged with an id; the UI drops responses that arrive after a
// newer request was sent.
self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { id, code } = event.data;
  const started = performance.now();
  try {
    const result = analyze(code);
    const elapsedMs = Math.round(performance.now() - started);
    const response: AnalyzeResponse & { elapsedMs: number } = { id, result, elapsedMs };
    self.postMessage(response);
  } catch (err) {
    self.postMessage({
      id,
      result: {
        steps: [],
        diagnostics: [
          {
            start: 0,
            end: 0,
            message: `analysis failed: ${err instanceof Error ? err.message : String(err)}`,
            code: -1,
          },
        ],
        hover: [],
      },
      elapsedMs: 0,
    });
  }
};
