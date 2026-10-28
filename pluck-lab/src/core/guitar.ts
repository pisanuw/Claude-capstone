/** Tuning, chord shapes, the QWERTY layout and strum timing. */
import type { PluckEvent } from './engine';

/** Standard tuning, low E (string 0) to high e (string 5), as MIDI notes. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'] as const;

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface Chord {
  name: string;
  key: string;
  /** Fret per string, low E first; null = not played. */
  frets: (number | null)[];
}

export const CHORDS: readonly Chord[] = [
  { name: 'C', key: 'a', frets: [null, 3, 2, 0, 1, 0] },
  { name: 'G', key: 's', frets: [3, 2, 0, 0, 0, 3] },
  { name: 'D', key: 'd', frets: [null, null, 0, 2, 3, 2] },
  { name: 'Em', key: 'f', frets: [0, 2, 2, 0, 0, 0] },
  { name: 'Am', key: 'g', frets: [null, 0, 2, 2, 1, 0] },
  { name: 'F', key: 'z', frets: [1, 3, 3, 2, 1, 1] },
  { name: 'A', key: 'x', frets: [null, 0, 2, 2, 2, 0] },
  { name: 'E', key: 'c', frets: [0, 2, 2, 1, 0, 0] },
  { name: 'Dm', key: 'v', frets: [null, null, 0, 2, 3, 1] },
  { name: 'E7', key: 'b', frets: [0, 2, 0, 1, 0, 0] },
  { name: 'Open', key: 'n', frets: [0, 0, 0, 0, 0, 0] },
];

export type KeyAction =
  | { kind: 'chord'; chord: number }
  | { kind: 'strum'; direction: 'down' | 'up' }
  | { kind: 'pluck'; string: number }
  | { kind: 'mute' };

export const STRUM_KEYS = { down: 'h', up: 'j' } as const;
export const MUTE_KEY = 'k';

/** Map a KeyboardEvent.key to an action, or null. */
export function keyAction(key: string): KeyAction | null {
  const k = key.toLowerCase();
  const chord = CHORDS.findIndex((c) => c.key === k);
  if (chord >= 0) return { kind: 'chord', chord };
  if (k === STRUM_KEYS.down) return { kind: 'strum', direction: 'down' };
  if (k === STRUM_KEYS.up) return { kind: 'strum', direction: 'up' };
  if (k === MUTE_KEY || k === ' ') return { kind: 'mute' };
  if (/^[1-6]$/.test(k)) return { kind: 'pluck', string: Number(k) - 1 };
  return null;
}

export function stringMidi(chord: Chord, string: number): number | null {
  const fret = chord.frets[string];
  return fret === null || fret === undefined ? null : STANDARD_TUNING[string]! + fret;
}

/**
 * A strum is the chord's strings started a few milliseconds apart: low to high
 * going down, high to low coming back up (and a little softer).
 */
export function strumEvents(
  chord: Chord,
  direction: 'down' | 'up',
  spreadMs: number,
  sampleRate: number,
  seed: number,
): PluckEvent[] {
  const order = [0, 1, 2, 3, 4, 5].filter((s) => stringMidi(chord, s) !== null);
  if (direction === 'up') order.reverse();
  const step = (spreadMs / 1000) * sampleRate;
  return order.map((string, i) => ({
    string,
    frequency: midiToFrequency(stringMidi(chord, string)!),
    delay: Math.round(i * step),
    velocity: direction === 'down' ? 0.9 : 0.75,
    seed: (seed + string * 7919) >>> 0,
  }));
}

/** One string of the current chord, or the open string when the chord skips it. */
export function pluckEvent(chord: Chord, string: number, seed: number): PluckEvent {
  const midi = stringMidi(chord, string) ?? STANDARD_TUNING[string]!;
  return { string, frequency: midiToFrequency(midi), delay: 0, velocity: 0.9, seed: (seed + string * 7919) >>> 0 };
}

/** The open strings, as { name, freq } for tables. */
export const OPEN_STRINGS = STANDARD_TUNING.map((m) => ({ name: noteName(m), freq: midiToFrequency(m) }));

/** Open strings plus the high e at the 12th and 24th frets, where quantization bites. */
export const TUNING_NOTES = [...OPEN_STRINGS, ...[76, 88].map((m) => ({ name: noteName(m), freq: midiToFrequency(m) }))];
