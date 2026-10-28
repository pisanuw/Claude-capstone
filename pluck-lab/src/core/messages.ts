/** Messages from the page to the audio engine (AudioWorklet port or ScriptProcessor fallback). */
import type { Engine, EngineParams, PluckEvent } from './engine';

export type EngineMessage =
  | { type: 'pluck'; events: PluckEvent[] }
  | { type: 'params'; params: Partial<EngineParams> }
  | { type: 'filter'; source: string }
  | { type: 'damp' };

/** Apply one message; returns an error string for a filter that would not compile. */
export function applyMessage(engine: Engine, msg: EngineMessage): string | null {
  switch (msg.type) {
    case 'pluck':
      engine.schedule(msg.events);
      return null;
    case 'params':
      engine.setParams(msg.params);
      return null;
    case 'filter':
      return engine.setFilter(msg.source);
    case 'damp':
      engine.damp();
      return null;
  }
}
