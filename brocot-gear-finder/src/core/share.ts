// Share links: the whole design lives in the URL fragment so it never reaches a server.
// #t=<target>&min=8&max=120&s=3&m=2&train=8x64.10x75 (driver x driven per stage).

import { DEFAULT_LIMITS } from './presets';
import type { Limits, Stage } from './search';

export interface ShareState {
  target: string;
  limits: Limits;
  module: number;
  train: Stage[] | null;
}

export const DEFAULT_MODULE = 2;

export function encodeState(s: ShareState): string {
  const p = new URLSearchParams();
  p.set('t', s.target);
  p.set('min', String(s.limits.minTeeth));
  p.set('max', String(s.limits.maxTeeth));
  p.set('s', String(s.limits.maxStages));
  p.set('m', String(s.module));
  if (s.train?.length) p.set('train', encodeTrain(s.train));
  return p.toString();
}

export function encodeTrain(stages: Stage[]): string {
  return stages.map((st) => `${st.driver}x${st.driven}`).join('.');
}

export function decodeTrain(src: string): Stage[] | null {
  if (!/^\d+x\d+(\.\d+x\d+){0,5}$/.test(src)) return null;
  return src.split('.').map((pair) => {
    const [driver, driven] = pair.split('x').map(Number) as [number, number];
    return { driver, driven };
  });
}

const int = (v: string | null, fallback: number) => {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n > 0 ? n : fallback;
};

export function decodeState(hash: string): ShareState | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const target = p.get('t');
  if (!target) return null;
  const m = Number(p.get('m'));
  const trainSrc = p.get('train');
  return {
    target: target.slice(0, 200),
    limits: {
      minTeeth: int(p.get('min'), DEFAULT_LIMITS.minTeeth),
      maxTeeth: int(p.get('max'), DEFAULT_LIMITS.maxTeeth),
      maxStages: int(p.get('s'), DEFAULT_LIMITS.maxStages),
    },
    module: m > 0 && m <= 20 ? m : DEFAULT_MODULE,
    train: trainSrc ? decodeTrain(trainSrc) : null,
  };
}
