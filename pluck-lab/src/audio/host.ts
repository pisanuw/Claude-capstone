/**
 * Starts audio: an AudioContext (at a requested sample rate when the browser
 * allows it) and the Engine, in an AudioWorklet when available or a
 * ScriptProcessor on the main thread otherwise.
 */
import workletUrl from './worklet.ts?worker&url';
import { Engine } from '../core/engine';
import { applyMessage, type EngineMessage } from '../core/messages';

export interface AudioHost {
  readonly sampleRate: number;
  readonly mode: 'worklet' | 'script-processor';
  send(msg: EngineMessage): void;
  close(): Promise<void>;
}

export async function createHost(requestedRate: number, onError: (message: string) => void): Promise<AudioHost> {
  let ctx: AudioContext;
  try {
    ctx = requestedRate > 0 ? new AudioContext({ sampleRate: requestedRate }) : new AudioContext();
  } catch {
    // Some browsers refuse unusual rates; fall back to the device rate.
    ctx = new AudioContext();
  }
  await ctx.resume();

  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'pluck-lab', { numberOfInputs: 0, outputChannelCount: [2] });
      node.port.onmessage = (e: MessageEvent<{ type: string; message: string }>) => {
        if (e.data.type === 'error') onError(e.data.message);
      };
      node.connect(ctx.destination);
      return {
        sampleRate: ctx.sampleRate,
        mode: 'worklet',
        send: (msg) => node.port.postMessage(msg),
        close: () => ctx.close(),
      };
    } catch (err) {
      console.warn('AudioWorklet unavailable, using ScriptProcessor', err);
    }
  }

  const engine = new Engine(ctx.sampleRate);
  const node = ctx.createScriptProcessor(1024, 0, 1);
  node.onaudioprocess = (e) => {
    engine.process(e.outputBuffer.getChannelData(0));
    if (engine.lastError) {
      onError(engine.lastError);
      engine.lastError = null;
    }
  };
  node.connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate,
    mode: 'script-processor',
    send: (msg) => {
      const error = applyMessage(engine, msg);
      if (error) onError(error);
    },
    close: () => ctx.close(),
  };
}
