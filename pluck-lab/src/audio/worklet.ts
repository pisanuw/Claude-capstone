/**
 * AudioWorklet processor: the Engine running on the audio thread. Bundled by
 * Vite as its own script (imported with ?worker&url) so it can import the core.
 */
import { Engine } from '../core/engine';
import { applyMessage, type EngineMessage } from '../core/messages';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class PluckProcessor extends AudioWorkletProcessor {
  private engine = new Engine(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<EngineMessage>) => {
      const error = applyMessage(this.engine, e.data);
      if (error) this.port.postMessage({ type: 'error', message: error });
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels || channels.length === 0) return true;
    const first = channels[0]!;
    this.engine.process(first);
    for (let c = 1; c < channels.length; c++) channels[c]!.set(first);
    if (this.engine.lastError) {
      this.port.postMessage({ type: 'error', message: this.engine.lastError });
      this.engine.lastError = null;
    }
    return true;
  }
}

registerProcessor('pluck-lab', PluckProcessor);
