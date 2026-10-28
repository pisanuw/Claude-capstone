/** Guided lecture scenes. Each isolates one idea and sets the lab up to show it. */

export type Panel = 'tuning' | 'decay' | 'strum' | 'filter';

export interface LabSettings {
  decay: number;
  weight: number;
  pickPosition: number;
  fractional: boolean;
  decayMode: 'natural' | 'equal';
  /** Milliseconds between strings in a strum. */
  spreadMs: number;
  /** Visualization speed in samples per frame; 0 = real time. */
  speed: number;
  /** Which string the delay-line and spectrum views follow. */
  focus: number;
  chord: number;
  panel: Panel;
  /** Audio sample rate to request; 0 = the device default. */
  sampleRate: number;
}

export const DEFAULT_SETTINGS: LabSettings = {
  decay: 0.993,
  weight: 0.5,
  pickPosition: 0.13,
  fractional: true,
  decayMode: 'natural',
  spreadMs: 12,
  speed: 0,
  focus: 1,
  chord: 0,
  panel: 'strum',
  sampleRate: 0,
};

export type ScenePlay =
  | { kind: 'strum'; direction: 'down' | 'up' }
  | { kind: 'pluck'; string: number }
  | { kind: 'note'; string: number; midi: number };

export interface SceneStep {
  label: string;
  set?: Partial<LabSettings>;
  /** Chord name to select before playing. */
  chord?: string;
  /** Filter preset id to load before playing. */
  preset?: string;
  play?: ScenePlay;
}

export interface Scene {
  id: string;
  title: string;
  body: string[];
  set: Partial<LabSettings>;
  preset?: string;
  steps: SceneStep[];
}

export const SCENES: readonly Scene[] = [
  {
    id: 'noise-to-note',
    title: '1. A buffer of noise becomes a string',
    body: [
      'Plucking fills a delay line of N = sampleRate / frequency samples with random noise. Each step takes the oldest sample out, averages it with the one before, and writes the result back in.',
      'The view is slowed to a few samples per frame. Watch the jagged noise smooth out a little on every trip round the loop. The harmonics chart is the delay line\'s own spectrum: it starts as uneven hiss across all 40 bars, then the high harmonics shrink trip by trip while the low ones survive. That shrinking is the tone becoming a string.',
      'Nothing else is going on. A queue and a two-point average are the whole instrument.',
    ],
    set: { speed: 6, focus: 1, pickPosition: 0, weight: 0.5, decay: 0.993, fractional: true, chord: 10, panel: 'filter' },
    preset: 'weighted',
    steps: [
      { label: 'Pluck the open A string', play: { kind: 'pluck', string: 1 } },
      { label: 'Same, but at 1 sample per frame', set: { speed: 1 }, play: { kind: 'pluck', string: 1 } },
      { label: 'Same, without the averaging', preset: 'none', set: { speed: 16 }, play: { kind: 'pluck', string: 1 } },
      { label: 'Back to real time', preset: 'weighted', set: { speed: 0 }, play: { kind: 'pluck', string: 1 } },
    ],
  },
  {
    id: 'pitch-quantized',
    title: '2. Why pitch is quantized',
    body: [
      'A delay line holds a whole number of samples, so without help the period can only be a whole number of samples (plus the filter\'s half sample). At 48 kHz the open strings land within 3 cents, but the 12th fret on the high e (659 Hz) wants 72.3 samples and gets 72: 7 cents sharp.',
      'Lower the sample rate and it gets much worse: at 8 kHz the open high e is 16 cents flat and two octaves up is more than a semitone off. The fix is a first-order allpass in the loop, which delays by a fraction of a sample without changing the loudness of any frequency.',
      'The table shows the error each note would have with integer delays at the current rate. Switch the sample rate to hear it.',
    ],
    set: { fractional: false, panel: 'tuning', focus: 5, speed: 0, pickPosition: 0.13, decayMode: 'natural' },
    preset: 'weighted',
    steps: [
      { label: 'Octave on the e string, integer delays', set: { fractional: false }, play: { kind: 'note', string: 5, midi: 76 } },
      { label: 'Same note with the allpass', set: { fractional: true }, play: { kind: 'note', string: 5, midi: 76 } },
      { label: 'Strum G at 8 kHz, integer delays', chord: 'G', set: { sampleRate: 8000, fractional: false }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Strum G at 8 kHz with the allpass', chord: 'G', set: { sampleRate: 8000, fractional: true }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Back to the device rate', set: { sampleRate: 0, fractional: true } },
    ],
  },
  {
    id: 'decay',
    title: '3. Why higher notes die faster',
    body: [
      'Each trip round the loop loses a fixed fraction of the sound. A high E makes three times as many trips per second as the low A, so it loses three times as much per second.',
      'The table works this out from the filter: amplitude kept per period at each string\'s fundamental, and the seconds it takes to fall 60 dB. "Equal decay" raises the decay factor for high notes to compensate (rho to the power f_ref / f), the way a real guitar\'s body and strings roughly do.',
    ],
    set: { panel: 'decay', decayMode: 'natural', weight: 0.5, decay: 0.993, speed: 0, pickPosition: 0.13 },
    preset: 'weighted',
    steps: [
      { label: 'Pluck low E', chord: 'Open', play: { kind: 'pluck', string: 0 } },
      { label: 'Pluck high e', chord: 'Open', play: { kind: 'pluck', string: 5 } },
      { label: 'Strum Em, natural decay', chord: 'Em', set: { decayMode: 'natural' }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Strum Em, equal decay', chord: 'Em', set: { decayMode: 'equal' }, play: { kind: 'strum', direction: 'down' } },
    ],
  },
  {
    id: 'tone',
    title: '4. The filter is the tone control',
    body: [
      'The weighted average keeps (1 - S) of the current sample and S of the previous one. S = 0.5 is the original average and cuts the top hardest; small S barely filters, so the string stays bright and rings longer.',
      'Watch the response curve in the filter panel: its slope decides how fast each harmonic dies relative to the fundamental.',
    ],
    set: { panel: 'filter', speed: 0, decay: 0.998, pickPosition: 0.13, decayMode: 'natural' },
    preset: 'weighted',
    steps: [
      { label: 'Dark: S = 0.5', chord: 'Am', set: { weight: 0.5 }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Bright: S = 0.1', chord: 'Am', set: { weight: 0.1 }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Short: decay 0.98', chord: 'Am', set: { weight: 0.5, decay: 0.98 }, play: { kind: 'strum', direction: 'down' } },
    ],
  },
  {
    id: 'pick-position',
    title: '5. Where you pick',
    body: [
      'Picking at a fraction beta of the string cannot excite any harmonic that has a node there. Pluck Lab models it by comb-filtering the starting noise: subtract a copy delayed by beta times N.',
      'At beta = 1/2 (the middle) every even harmonic vanishes and the tone goes hollow; near the bridge (small beta) the notches move up and the sound gets twangy. Watch the gaps in the spectrum.',
    ],
    set: { panel: 'filter', speed: 0, focus: 1, weight: 0.3, decay: 0.997, decayMode: 'natural' },
    preset: 'weighted',
    steps: [
      { label: 'Middle of the string (beta = 0.5)', chord: 'Open', set: { pickPosition: 0.5 }, play: { kind: 'pluck', string: 1 } },
      { label: 'Near the bridge (beta = 0.1)', chord: 'Open', set: { pickPosition: 0.1 }, play: { kind: 'pluck', string: 1 } },
      { label: 'No pick model (pure noise)', chord: 'Open', set: { pickPosition: 0 }, play: { kind: 'pluck', string: 1 } },
    ],
  },
  {
    id: 'strum',
    title: '6. A strum is six plucks a few milliseconds apart',
    body: [
      'There is no strum algorithm. A downstroke starts the low string first and each higher string a few milliseconds later; an upstroke goes the other way and a little softer.',
      'At 0 ms the chord is a single click-like attack. Around 10 to 20 ms it sounds like a pick. Past 50 ms the ear hears separate notes: an arpeggio.',
    ],
    set: { panel: 'strum', speed: 0, pickPosition: 0.13, decay: 0.993, weight: 0.5, decayMode: 'natural' },
    preset: 'weighted',
    steps: [
      { label: 'All at once (0 ms)', chord: 'C', set: { spreadMs: 0 }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Pick strum (12 ms)', chord: 'C', set: { spreadMs: 12 }, play: { kind: 'strum', direction: 'down' } },
      { label: 'Upstroke (12 ms)', chord: 'C', set: { spreadMs: 12 }, play: { kind: 'strum', direction: 'up' } },
      { label: 'Arpeggio (80 ms)', chord: 'C', set: { spreadMs: 80 }, play: { kind: 'strum', direction: 'down' } },
    ],
  },
  {
    id: 'your-filter',
    title: '7. Write your own filter',
    body: [
      'The filter panel holds the body of the loop filter as JavaScript. Edit it and press Apply (or Ctrl+Enter): it is tested, analysed and hot-swapped into the audio thread without a page reload.',
      'Try the presets first: the three-point average uses state to remember an older sample, the drum flips signs at random, and the unstable one shows why the loop gain has to stay below 1.',
    ],
    set: { panel: 'filter', speed: 0 },
    steps: [
      { label: 'Load the three-point average and strum', preset: 'three-point', chord: 'G', play: { kind: 'strum', direction: 'down' } },
      { label: 'Load the drum and pluck', preset: 'drum', chord: 'Open', play: { kind: 'pluck', string: 0 } },
      { label: 'Load the unstable filter and pluck', preset: 'unstable', chord: 'Open', play: { kind: 'pluck', string: 2 } },
    ],
  },
];
