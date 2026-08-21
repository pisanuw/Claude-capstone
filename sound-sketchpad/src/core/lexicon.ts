/**
 * The sound vocabulary: base sounds the parser can recognize and modifier
 * words that transform them. This deterministic catalog replaces the LLM
 * call suggested in the original idea, so identical descriptions always
 * produce identical, license-free audio.
 */

import type { Layer, SoundSpec } from './spec.js';
import { clamp, sweep } from './spec.js';

export interface BaseSound {
  id: string;
  words: string[];
  build: () => SoundSpec;
}

export interface Modifier {
  id: string;
  words: string[];
  describe: string;
  apply: (spec: SoundSpec) => void;
}

const env = (attack: number, decay: number, sustain: number, release: number) => ({
  attack,
  decay,
  sustain,
  release,
});

function base(
  name: string,
  duration: number,
  layers: Layer[],
  extra?: Partial<Pick<SoundSpec, 'echo' | 'drive' | 'crushBits' | 'masterGain'>>,
): SoundSpec {
  return {
    name,
    duration,
    layers,
    drive: 1,
    crushBits: 0,
    masterGain: 0.9,
    ...extra,
  };
}

export const BASE_SOUNDS: BaseSound[] = [
  {
    id: 'explosion',
    words: ['explosion', 'explode', 'blast', 'boom', 'bomb', 'detonation', 'grenade'],
    build: () =>
      base('explosion', 1.6, [
        {
          name: 'rumble',
          source: { kind: 'noise', color: 'brown' },
          env: env(0.005, 0.5, 0.25, 0.9),
          filter: { type: 'lowpass', freq: sweep(900, 120), q: 0.8 },
          gain: 1,
        },
        {
          name: 'crack',
          source: { kind: 'noise', color: 'white' },
          env: env(0.001, 0.12, 0, 0.05),
          filter: { type: 'highpass', freq: sweep(1200, 2500), q: 0.7 },
          gain: 0.5,
        },
        {
          name: 'sub thump',
          source: { kind: 'osc', shape: 'sine', freq: sweep(110, 35) },
          env: env(0.002, 0.35, 0, 0.2),
          gain: 0.9,
        },
      ], { drive: 1.6 }),
  },
  {
    id: 'laser',
    words: ['laser', 'zap', 'blaster', 'phaser', 'raygun', 'pew'],
    build: () =>
      base('laser', 0.35, [
        {
          name: 'beam',
          source: { kind: 'osc', shape: 'sawtooth', freq: sweep(1800, 220) },
          env: env(0.002, 0.15, 0.15, 0.12),
          filter: { type: 'lowpass', freq: sweep(4800, 900), q: 2.5 },
          gain: 0.9,
        },
        {
          name: 'sizzle',
          source: { kind: 'noise', color: 'white' },
          env: env(0.001, 0.06, 0, 0.04),
          filter: { type: 'bandpass', freq: sweep(3500, 1500), q: 3 },
          gain: 0.25,
        },
      ]),
  },
  {
    id: 'coin',
    words: ['coin', 'pickup', 'collect', 'treasure', 'gem', 'gold'],
    build: () =>
      base('coin', 0.5, [
        {
          name: 'ping A',
          source: { kind: 'osc', shape: 'square', freq: sweep(988, 988, 'linear') },
          env: env(0.001, 0.08, 0, 0.03),
          gain: 0.5,
        },
        {
          name: 'ping B',
          source: { kind: 'osc', shape: 'square', freq: sweep(1319, 1319, 'linear') },
          env: env(0.001, 0.28, 0, 0.1),
          startAt: 0.08,
          gain: 0.5,
        },
      ]),
  },
  {
    id: 'jump',
    words: ['jump', 'hop', 'leap', 'bounce', 'boing', 'spring'],
    build: () =>
      base('jump', 0.4, [
        {
          name: 'rise',
          source: { kind: 'osc', shape: 'square', freq: sweep(180, 660) },
          env: env(0.005, 0.2, 0.2, 0.1),
          filter: { type: 'lowpass', freq: sweep(2500, 3500), q: 1 },
          gain: 0.8,
        },
      ]),
  },
  {
    id: 'powerup',
    words: ['powerup', 'levelup', 'upgrade', 'fanfare', 'victory', 'win', 'achievement'],
    build: () =>
      base('powerup', 0.9, [
        {
          name: 'arpeggio',
          source: { kind: 'osc', shape: 'square', freq: sweep(523, 523, 'linear') },
          env: env(0.002, 0.1, 0, 0.04),
          repeat: { times: 4, interval: 0.11, gainDecay: 1 },
          gain: 0.45,
        },
        {
          name: 'sweep up',
          source: { kind: 'osc', shape: 'triangle', freq: sweep(523, 2093) },
          env: env(0.01, 0.4, 0.3, 0.25),
          startAt: 0.3,
          gain: 0.5,
        },
      ]),
  },
  {
    id: 'hit',
    words: ['hit', 'punch', 'impact', 'thud', 'smack', 'slam', 'crash', 'kick'],
    build: () =>
      base('hit', 0.45, [
        {
          name: 'body',
          source: { kind: 'osc', shape: 'sine', freq: sweep(160, 55) },
          env: env(0.001, 0.18, 0, 0.1),
          gain: 0.95,
        },
        {
          name: 'snap',
          source: { kind: 'noise', color: 'white' },
          env: env(0.001, 0.05, 0, 0.03),
          filter: { type: 'bandpass', freq: sweep(1800, 900), q: 1.2 },
          gain: 0.45,
        },
      ], { drive: 1.4 }),
  },
  {
    id: 'footsteps',
    words: ['footstep', 'footsteps', 'walking', 'steps', 'walk', 'march'],
    build: () =>
      base('footsteps', 2.2, [
        {
          name: 'step',
          source: { kind: 'noise', color: 'brown' },
          env: env(0.002, 0.09, 0, 0.05),
          filter: { type: 'lowpass', freq: sweep(700, 300), q: 0.9 },
          repeat: { times: 4, interval: 0.55, gainDecay: 0.96 },
          gain: 0.9,
        },
        {
          name: 'scuff',
          source: { kind: 'noise', color: 'white' },
          env: env(0.005, 0.05, 0, 0.04),
          filter: { type: 'highpass', freq: sweep(2000), q: 0.7 },
          repeat: { times: 4, interval: 0.55, gainDecay: 0.96 },
          startAt: 0.02,
          gain: 0.18,
        },
      ]),
  },
  {
    id: 'knock',
    words: ['knock', 'knocking', 'tap', 'rap'],
    build: () =>
      base('knock', 1.1, [
        {
          name: 'knock',
          source: { kind: 'osc', shape: 'sine', freq: sweep(190, 90) },
          env: env(0.001, 0.09, 0, 0.05),
          repeat: { times: 3, interval: 0.28, gainDecay: 0.9 },
          gain: 0.9,
        },
      ]),
  },
  {
    id: 'bell',
    words: ['bell', 'chime', 'ding', 'gong', 'doorbell', 'ring'],
    build: () =>
      base('bell', 1.8, [
        {
          name: 'fundamental',
          source: { kind: 'osc', shape: 'sine', freq: sweep(660, 660, 'linear') },
          env: env(0.002, 1.2, 0, 0.5),
          gain: 0.7,
        },
        {
          name: 'partial 2.7x',
          source: { kind: 'osc', shape: 'sine', freq: sweep(1782, 1782, 'linear') },
          env: env(0.002, 0.7, 0, 0.3),
          gain: 0.3,
        },
        {
          name: 'partial 5.4x',
          source: { kind: 'osc', shape: 'sine', freq: sweep(3564, 3564, 'linear') },
          env: env(0.002, 0.35, 0, 0.15),
          gain: 0.15,
        },
      ]),
  },
  {
    id: 'rain',
    words: ['rain', 'rainfall', 'drizzle', 'downpour', 'storm'],
    build: () =>
      base('rain', 3, [
        {
          name: 'shower',
          source: { kind: 'noise', color: 'pink' },
          env: env(0.6, 0.5, 0.85, 0.8),
          filter: { type: 'bandpass', freq: sweep(2800), q: 0.5 },
          gain: 0.8,
        },
        {
          name: 'patter',
          source: { kind: 'noise', color: 'white' },
          env: env(0.6, 0.5, 0.8, 0.8),
          filter: { type: 'highpass', freq: sweep(5000), q: 0.7 },
          gain: 0.3,
        },
      ]),
  },
  {
    id: 'wind',
    words: ['wind', 'breeze', 'gust', 'howl', 'gale'],
    build: () =>
      base('wind', 3, [
        {
          name: 'gust',
          source: { kind: 'noise', color: 'pink' },
          env: env(0.9, 0.8, 0.7, 1),
          filter: { type: 'bandpass', freq: sweep(400, 900), q: 1.8 },
          gain: 0.9,
        },
      ]),
  },
  {
    id: 'thunder',
    words: ['thunder', 'thunderclap', 'rumble'],
    build: () =>
      base('thunder', 2.6, [
        {
          name: 'clap',
          source: { kind: 'noise', color: 'white' },
          env: env(0.005, 0.25, 0.1, 0.2),
          filter: { type: 'lowpass', freq: sweep(2400, 700), q: 0.8 },
          gain: 0.6,
        },
        {
          name: 'roll',
          source: { kind: 'noise', color: 'brown' },
          env: env(0.05, 1.2, 0.3, 1),
          filter: { type: 'lowpass', freq: sweep(500, 90), q: 0.9 },
          gain: 1,
        },
      ], { drive: 1.3 }),
  },
  {
    id: 'drip',
    words: ['drip', 'droplet', 'dripping', 'leak'],
    build: () =>
      base('drip', 1.6, [
        {
          name: 'drop',
          source: { kind: 'osc', shape: 'sine', freq: sweep(1200, 500) },
          env: env(0.001, 0.09, 0, 0.05),
          repeat: { times: 3, interval: 0.5, gainDecay: 0.85 },
          gain: 0.8,
        },
      ], { echo: { time: 0.18, feedback: 0.25, mix: 0.2 } }),
  },
  {
    id: 'bubble',
    words: ['bubble', 'bubbles', 'blub', 'gurgle', 'boil'],
    build: () =>
      base('bubble', 1.4, [
        {
          name: 'blub',
          source: { kind: 'osc', shape: 'sine', freq: sweep(300, 900) },
          env: env(0.005, 0.1, 0, 0.05),
          repeat: { times: 5, interval: 0.22, gainDecay: 0.92 },
          gain: 0.75,
        },
      ]),
  },
  {
    id: 'whoosh',
    words: ['whoosh', 'swoosh', 'swipe', 'swish', 'dash', 'fly', 'flyby'],
    build: () =>
      base('whoosh', 0.8, [
        {
          name: 'air',
          source: { kind: 'noise', color: 'pink' },
          env: env(0.15, 0.3, 0.2, 0.25),
          filter: { type: 'bandpass', freq: sweep(300, 2400), q: 1.6 },
          gain: 1,
        },
      ]),
  },
  {
    id: 'click',
    words: ['click', 'button', 'switch', 'toggle', 'keypress', 'clack'],
    build: () =>
      base('click', 0.12, [
        {
          name: 'tick',
          source: { kind: 'noise', color: 'white' },
          env: env(0.001, 0.02, 0, 0.01),
          filter: { type: 'bandpass', freq: sweep(2600), q: 2 },
          gain: 0.8,
        },
        {
          name: 'knuckle',
          source: { kind: 'osc', shape: 'sine', freq: sweep(700, 350) },
          env: env(0.001, 0.03, 0, 0.02),
          gain: 0.4,
        },
      ]),
  },
  {
    id: 'alarm',
    words: ['alarm', 'siren', 'alert', 'warning', 'klaxon', 'emergency'],
    build: () =>
      base('alarm', 1.8, [
        {
          name: 'wail',
          source: {
            kind: 'osc',
            shape: 'square',
            freq: sweep(700, 700, 'linear'),
            vibrato: { rate: 3.2, depth: 0.28 },
          },
          env: env(0.02, 0.2, 0.8, 0.2),
          filter: { type: 'lowpass', freq: sweep(3200), q: 1 },
          gain: 0.7,
        },
      ]),
  },
  {
    id: 'engine',
    words: ['engine', 'motor', 'car', 'truck', 'machine', 'machinery', 'idle'],
    build: () =>
      base('engine', 2.4, [
        {
          name: 'cylinders',
          source: {
            kind: 'osc',
            shape: 'sawtooth',
            freq: sweep(75, 85, 'linear'),
            vibrato: { rate: 11, depth: 0.06 },
          },
          env: env(0.3, 0.3, 0.85, 0.5),
          filter: { type: 'lowpass', freq: sweep(600), q: 1.1 },
          gain: 0.85,
        },
        {
          name: 'rattle',
          source: { kind: 'noise', color: 'brown' },
          env: env(0.3, 0.3, 0.7, 0.5),
          filter: { type: 'bandpass', freq: sweep(240), q: 2 },
          gain: 0.35,
        },
      ]),
  },
  {
    id: 'heartbeat',
    words: ['heartbeat', 'heart', 'pulse'],
    build: () =>
      base('heartbeat', 2.4, [
        {
          name: 'lub',
          source: { kind: 'osc', shape: 'sine', freq: sweep(85, 45) },
          env: env(0.005, 0.12, 0, 0.08),
          repeat: { times: 3, interval: 0.85, gainDecay: 1 },
          gain: 1,
        },
        {
          name: 'dub',
          source: { kind: 'osc', shape: 'sine', freq: sweep(70, 40) },
          env: env(0.005, 0.1, 0, 0.07),
          repeat: { times: 3, interval: 0.85, gainDecay: 1 },
          startAt: 0.22,
          gain: 0.8,
        },
      ]),
  },
  {
    id: 'static',
    words: ['static', 'radio', 'interference', 'noise', 'crackle', 'glitch'],
    build: () =>
      base('static', 1.6, [
        {
          name: 'hiss',
          source: { kind: 'noise', color: 'white' },
          env: env(0.05, 0.2, 0.8, 0.3),
          filter: { type: 'highpass', freq: sweep(1200), q: 0.7 },
          gain: 0.7,
        },
        {
          name: 'sputter',
          source: { kind: 'noise', color: 'pink' },
          env: env(0.02, 0.1, 0.6, 0.2),
          filter: { type: 'bandpass', freq: sweep(500, 3000), q: 4 },
          gain: 0.4,
        },
      ], { crushBits: 8 }),
  },
];

export const MODIFIERS: Modifier[] = [
  {
    id: 'muffled',
    words: ['muffled', 'underground', 'behind', 'buried', 'dampened', 'covered'],
    describe: 'heavy low-pass filtering, softened transients',
    apply: (spec) => {
      for (const layer of spec.layers) {
        const start = layer.filter ? layer.filter.freq.start * 0.3 : 500;
        const end = layer.filter ? layer.filter.freq.end * 0.3 : 400;
        layer.filter = {
          type: 'lowpass',
          freq: sweep(clamp(start, 80, 900), clamp(end, 80, 900)),
          q: 0.8,
        };
        layer.env.attack = Math.max(layer.env.attack, 0.015);
      }
      spec.drive = Math.max(1, spec.drive * 0.8);
    },
  },
  {
    id: 'underwater',
    words: ['underwater', 'submerged', 'water', 'ocean', 'sea'],
    describe: 'low-pass filtering, slow wobble, soft echo',
    apply: (spec) => {
      for (const layer of spec.layers) {
        layer.filter = { type: 'lowpass', freq: sweep(600, 350), q: 1.4 };
        if (layer.source.kind === 'osc') {
          layer.source.vibrato = { rate: 5, depth: 0.05 };
        }
      }
      spec.echo = { time: 0.16, feedback: 0.35, mix: 0.3 };
    },
  },
  {
    id: 'distant',
    words: ['distant', 'far', 'faraway', 'faint', 'remote'],
    describe: 'quieter, duller, more room sound',
    apply: (spec) => {
      for (const layer of spec.layers) {
        layer.gain *= 0.5;
        if (layer.filter && layer.filter.type !== 'highpass') {
          layer.filter.freq.start *= 0.5;
          layer.filter.freq.end *= 0.5;
        } else if (!layer.filter) {
          layer.filter = { type: 'lowpass', freq: sweep(1400, 1000), q: 0.8 };
        }
      }
      spec.echo = {
        time: spec.echo?.time ?? 0.24,
        feedback: Math.max(spec.echo?.feedback ?? 0, 0.3),
        mix: Math.max(spec.echo?.mix ?? 0, 0.35),
      };
    },
  },
  {
    id: 'close',
    words: ['close', 'nearby', 'near'],
    describe: 'dry and present',
    apply: (spec) => {
      delete spec.echo;
      spec.drive = Math.max(spec.drive, 1.15);
    },
  },
  {
    id: 'huge',
    words: ['huge', 'massive', 'giant', 'enormous', 'big'],
    describe: 'longer, pitched down, heavier',
    apply: (spec) => {
      spec.duration *= 1.5;
      scalePitch(spec, 0.6);
      stretchEnvelopes(spec, 1.4);
      spec.drive = Math.max(spec.drive, 1.3);
    },
  },
  {
    id: 'tiny',
    words: ['tiny', 'small', 'little', 'mini', 'miniature'],
    describe: 'shorter and pitched up',
    apply: (spec) => {
      spec.duration = Math.max(0.12, spec.duration * 0.6);
      scalePitch(spec, 1.7);
      stretchEnvelopes(spec, 0.65);
    },
  },
  {
    id: 'metallic',
    words: ['metallic', 'metal', 'steel', 'iron', 'clang'],
    describe: 'added inharmonic ringing partials',
    apply: (spec) => {
      spec.layers.push(
        {
          name: 'metal ring A',
          source: { kind: 'osc', shape: 'sine', freq: sweep(1730, 1730, 'linear') },
          env: { attack: 0.001, decay: spec.duration * 0.5, sustain: 0, release: 0.1 },
          gain: 0.22,
        },
        {
          name: 'metal ring B',
          source: { kind: 'osc', shape: 'sine', freq: sweep(2647, 2647, 'linear') },
          env: { attack: 0.001, decay: spec.duration * 0.35, sustain: 0, release: 0.08 },
          gain: 0.14,
        },
      );
    },
  },
  {
    id: 'wooden',
    words: ['wooden', 'wood', 'marble', 'table', 'hollow'],
    describe: 'short knocky resonance, damped highs',
    apply: (spec) => {
      spec.layers.push({
        name: 'wood knock',
        source: { kind: 'osc', shape: 'triangle', freq: sweep(240, 170) },
        env: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
        gain: 0.4,
      });
      for (const layer of spec.layers) {
        if (layer.filter?.type === 'highpass') layer.gain *= 0.6;
      }
    },
  },
  {
    id: 'glassy',
    words: ['glass', 'glassy', 'crystal', 'icy', 'ice'],
    describe: 'bright fast-decaying high partials',
    apply: (spec) => {
      spec.layers.push({
        name: 'glass shimmer',
        source: { kind: 'osc', shape: 'sine', freq: sweep(3921, 3921, 'linear') },
        env: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.08 },
        gain: 0.18,
      });
    },
  },
  {
    id: 'echoing',
    words: ['echo', 'echoing', 'cave', 'cavern', 'canyon', 'reverb', 'hall'],
    describe: 'long echo tail',
    apply: (spec) => {
      spec.echo = { time: 0.32, feedback: 0.5, mix: 0.45 };
      spec.duration += 0.8;
    },
  },
  {
    id: 'soft',
    words: ['soft', 'gentle', 'quiet', 'subtle', 'calm'],
    describe: 'slower attacks, lower level',
    apply: (spec) => {
      for (const layer of spec.layers) {
        layer.env.attack = Math.max(layer.env.attack * 2, 0.02);
        layer.gain *= 0.65;
      }
      spec.drive = 1;
    },
  },
  {
    id: 'harsh',
    words: ['harsh', 'aggressive', 'angry', 'brutal', 'distorted', 'loud'],
    describe: 'saturation and edge',
    apply: (spec) => {
      spec.drive = Math.max(spec.drive, 2.2);
      for (const layer of spec.layers) {
        if (layer.source.kind === 'osc' && layer.source.shape === 'sine') {
          layer.source.shape = 'sawtooth';
        }
      }
    },
  },
  {
    id: 'deep',
    words: ['deep', 'low', 'bass', 'heavy'],
    describe: 'pitched down',
    apply: (spec) => scalePitch(spec, 0.55),
  },
  {
    id: 'high',
    words: ['high', 'shrill', 'squeaky', 'bright'],
    describe: 'pitched up',
    apply: (spec) => scalePitch(spec, 1.8),
  },
  {
    id: 'slow',
    words: ['slow', 'long', 'drawn', 'sustained'],
    describe: 'stretched in time',
    apply: (spec) => {
      spec.duration *= 1.5;
      stretchEnvelopes(spec, 1.5);
      for (const layer of spec.layers) {
        if (layer.repeat) layer.repeat.interval *= 1.4;
      }
    },
  },
  {
    id: 'fast',
    words: ['fast', 'quick', 'short', 'snappy', 'rapid'],
    describe: 'compressed in time',
    apply: (spec) => {
      spec.duration = Math.max(0.1, spec.duration * 0.6);
      stretchEnvelopes(spec, 0.6);
      for (const layer of spec.layers) {
        if (layer.repeat) layer.repeat.interval *= 0.65;
      }
    },
  },
  {
    id: 'retro',
    words: ['retro', '8bit', 'arcade', 'chiptune', 'videogame', 'nes'],
    describe: 'square waves and bit crushing',
    apply: (spec) => {
      for (const layer of spec.layers) {
        if (layer.source.kind === 'osc') layer.source.shape = 'square';
      }
      spec.crushBits = 8;
    },
  },
  {
    id: 'wobbly',
    words: ['wobbly', 'wobble', 'warbling', 'vibrato', 'shaky'],
    describe: 'pitch wobble on tonal layers',
    apply: (spec) => {
      for (const layer of spec.layers) {
        if (layer.source.kind === 'osc') {
          layer.source.vibrato = { rate: 6, depth: 0.08 };
        }
      }
    },
  },
];

export function scalePitch(spec: SoundSpec, factor: number): void {
  for (const layer of spec.layers) {
    if (layer.source.kind === 'osc') {
      layer.source.freq.start = clamp(layer.source.freq.start * factor, 25, 9000);
      layer.source.freq.end = clamp(layer.source.freq.end * factor, 25, 9000);
    }
    if (layer.filter) {
      // Move filters part of the way so timbre follows pitch without choking.
      const f = 1 + (factor - 1) * 0.6;
      layer.filter.freq.start = clamp(layer.filter.freq.start * f, 60, 12000);
      layer.filter.freq.end = clamp(layer.filter.freq.end * f, 60, 12000);
    }
  }
}

export function stretchEnvelopes(spec: SoundSpec, factor: number): void {
  for (const layer of spec.layers) {
    layer.env.attack *= factor;
    layer.env.decay *= factor;
    layer.env.release *= factor;
    if (layer.startAt) layer.startAt *= factor;
  }
}

const baseIndex = new Map<string, BaseSound>();
for (const b of BASE_SOUNDS) for (const w of b.words) baseIndex.set(w, b);

const modifierIndex = new Map<string, Modifier>();
for (const m of MODIFIERS) for (const w of m.words) modifierIndex.set(w, m);

export function lookupBase(word: string): BaseSound | undefined {
  return baseIndex.get(word);
}

export function lookupModifier(word: string): Modifier | undefined {
  return modifierIndex.get(word);
}
