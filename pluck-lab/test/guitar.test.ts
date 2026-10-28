import { describe, expect, it } from 'vitest';
import {
  CHORDS,
  keyAction,
  midiToFrequency,
  noteName,
  OPEN_STRINGS,
  pluckEvent,
  STANDARD_TUNING,
  stringMidi,
  strumEvents,
  TUNING_NOTES,
} from '../src/core/guitar';
import { spectrumDb, fft } from '../src/core/fft';

describe('notes', () => {
  it('converts MIDI to Hz and names', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(40)).toBeCloseTo(82.407, 3);
    expect(noteName(40)).toBe('E2');
    expect(noteName(61)).toBe('C♯4');
    expect(OPEN_STRINGS.map((s) => s.name)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(TUNING_NOTES.slice(-2).map((s) => s.name)).toEqual(['E5', 'E6']);
  });
});

describe('chords and keys', () => {
  it('has unique keys and six-string shapes', () => {
    expect(new Set(CHORDS.map((c) => c.key)).size).toBe(CHORDS.length);
    for (const c of CHORDS) expect(c.frets).toHaveLength(6);
  });

  it('maps keys to actions', () => {
    expect(keyAction('A')).toEqual({ kind: 'chord', chord: 0 });
    expect(keyAction('h')).toEqual({ kind: 'strum', direction: 'down' });
    expect(keyAction('j')).toEqual({ kind: 'strum', direction: 'up' });
    expect(keyAction('k')).toEqual({ kind: 'mute' });
    expect(keyAction(' ')).toEqual({ kind: 'mute' });
    expect(keyAction('3')).toEqual({ kind: 'pluck', string: 2 });
    expect(keyAction('7')).toBeNull();
    expect(keyAction('Enter')).toBeNull();
  });

  it('knows which strings a chord plays', () => {
    const c = CHORDS.find((x) => x.name === 'C')!;
    expect(stringMidi(c, 0)).toBeNull();
    expect(stringMidi(c, 1)).toBe(48);
    expect(stringMidi(c, 5)).toBe(STANDARD_TUNING[5]);
  });
});

describe('strums', () => {
  const D = CHORDS.find((x) => x.name === 'D')!;

  it('goes low to high on a downstroke, skipping muted strings', () => {
    const ev = strumEvents(D, 'down', 10, 48000, 1);
    expect(ev.map((e) => e.string)).toEqual([2, 3, 4, 5]);
    expect(ev.map((e) => e.delay)).toEqual([0, 480, 960, 1440]);
    expect(ev[0]!.frequency).toBeCloseTo(midiToFrequency(50), 9);
    expect(new Set(ev.map((e) => e.seed)).size).toBe(4);
  });

  it('goes high to low and softer on an upstroke', () => {
    const ev = strumEvents(D, 'up', 0, 48000, 1);
    expect(ev.map((e) => e.string)).toEqual([5, 4, 3, 2]);
    expect(ev.every((e) => e.delay === 0 && e.velocity < 0.9)).toBe(true);
  });

  it('plucks the open string where the chord skips it', () => {
    expect(pluckEvent(D, 0, 1).frequency).toBeCloseTo(midiToFrequency(40), 9);
    expect(pluckEvent(D, 5, 1).frequency).toBeCloseTo(midiToFrequency(66), 9);
  });
});

describe('fft', () => {
  it('finds a sine at its bin at about 0 dB', () => {
    const n = 1024;
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 64 * i) / n));
    const db = spectrumDb(x, n);
    expect(db).toHaveLength(n / 2 + 1);
    let best = 0;
    for (let k = 0; k < db.length; k++) if (db[k]! > db[best]!) best = k;
    expect(best).toBe(64);
    expect(Math.abs(db[64]!)).toBeLessThan(0.2);
    expect(db[200]!).toBeLessThan(-60);
  });

  it('zero-pads short input and rejects bad sizes', () => {
    expect(spectrumDb([1, 0, 0], 8)).toHaveLength(5);
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/);
  });
});

describe('harmonicsDb', () => {
  it('reads harmonic amplitudes of one period', async () => {
    const { harmonicsDb } = await import('../src/core/fft');
    const n = 100;
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n) + 0.1 * Math.sin((2 * Math.PI * 3 * i) / n));
    const h = harmonicsDb(x, 60);
    expect(h[0]!).toBeCloseTo(0, 3);
    expect(h[2]!).toBeCloseTo(-20, 2);
    expect(h[1]!).toBeLessThan(-100);
    expect(h[59]!).toBe(-120);
  });
});
