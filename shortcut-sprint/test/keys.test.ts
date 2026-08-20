import { describe, expect, it } from 'vitest';
import {
  ComboMatcher,
  chordCandidates,
  chordsEqual,
  comboForPlatform,
  displayCombo,
  formatCombo,
  isBrowserReserved,
  parseChord,
  parseCombo,
  type KeyEventLike,
} from '../src/core/keys';

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return { key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe('parseChord', () => {
  it('parses modifiers in any order into canonical order', () => {
    expect(parseChord('Shift+Ctrl+P')).toEqual({ mods: ['Ctrl', 'Shift'], key: 'P' });
  });

  it('normalizes aliases', () => {
    expect(parseChord('cmd+k')).toEqual({ mods: ['Meta'], key: 'K' });
    expect(parseChord('option+Up')).toEqual({ mods: ['Alt'], key: 'ArrowUp' });
    expect(parseChord('ctrl+esc')).toEqual({ mods: ['Ctrl'], key: 'Escape' });
  });

  it('handles bare punctuation and the plus key', () => {
    expect(parseChord('$')).toEqual({ mods: [], key: '$' });
    expect(parseChord('/')).toEqual({ mods: [], key: '/' });
    expect(parseChord('+')).toEqual({ mods: [], key: '+' });
    expect(parseChord('Ctrl++')).toEqual({ mods: ['Ctrl'], key: '+' });
  });

  it('accepts function and named keys case-insensitively', () => {
    expect(parseChord('f12')).toEqual({ mods: [], key: 'F12' });
    expect(parseChord('pageup')).toEqual({ mods: [], key: 'PageUp' });
    expect(parseChord('Space')).toEqual({ mods: [], key: 'Space' });
  });

  it('deduplicates repeated modifiers', () => {
    expect(parseChord('Ctrl+Ctrl+A')).toEqual({ mods: ['Ctrl'], key: 'A' });
  });

  it('rejects garbage', () => {
    expect(() => parseChord('')).toThrow();
    expect(() => parseChord('Ctrl+')).toThrow(/no key/);
    expect(() => parseChord('A+B')).toThrow(/two keys/);
    expect(() => parseChord('Ctrl+Frobnicate')).toThrow(/unknown key/);
  });
});

describe('parseCombo / formatCombo', () => {
  it('round-trips multi-chord combos', () => {
    expect(formatCombo(parseCombo('ctrl+k ctrl+s'))).toBe('Ctrl+K Ctrl+S');
    expect(formatCombo(parseCombo('G G'))).toBe('G G');
  });

  it('rejects empty and overlong combos', () => {
    expect(() => parseCombo('  ')).toThrow();
    expect(() => parseCombo('A B C D E')).toThrow(/too long/);
  });
});

describe('chordCandidates', () => {
  it('ignores pure modifier presses', () => {
    expect(chordCandidates(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toEqual([]);
    expect(chordCandidates(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toEqual([]);
  });

  it('uses code for letters, keeping Shift as a modifier', () => {
    const chords = chordCandidates(ev({ key: 'G', code: 'KeyG', shiftKey: true }));
    expect(chords).toEqual([{ mods: ['Shift'], key: 'G' }]);
  });

  it('produces both readings for shifted digits', () => {
    const chords = chordCandidates(ev({ key: '$', code: 'Digit4', shiftKey: true }));
    expect(chords).toContainEqual({ mods: ['Shift'], key: '4' });
    expect(chords).toContainEqual({ mods: [], key: '$' });
  });

  it('produces both readings for shifted punctuation', () => {
    const chords = chordCandidates(ev({ key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true }));
    expect(chords).toContainEqual({ mods: ['Ctrl', 'Shift'], key: '[' });
    expect(chords).toContainEqual({ mods: ['Ctrl'], key: '{' });
  });

  it('deduplicates when both readings agree', () => {
    expect(chordCandidates(ev({ key: '/', code: 'Slash', ctrlKey: true }))).toEqual([
      { mods: ['Ctrl'], key: '/' },
    ]);
    expect(chordCandidates(ev({ key: '4', code: 'Digit4' }))).toEqual([{ mods: [], key: '4' }]);
  });

  it('maps space and named keys', () => {
    expect(chordCandidates(ev({ key: ' ', code: 'Space' }))).toEqual([{ mods: [], key: 'Space' }]);
    expect(chordCandidates(ev({ key: 'F12', code: 'F12' }))).toEqual([{ mods: [], key: 'F12' }]);
    expect(chordCandidates(ev({ key: 'Escape', code: 'Escape' }))).toEqual([{ mods: [], key: 'Escape' }]);
  });

  it('falls back to key for unknown codes (non-US layouts)', () => {
    expect(chordCandidates(ev({ key: 'ü', code: 'BracketLeftIntl' }))).toEqual([{ mods: [], key: 'ü' }]);
  });

  it('ignores IME and media keys', () => {
    expect(chordCandidates(ev({ key: 'MediaPlayPause', code: 'MediaPlayPause' }))).toEqual([]);
    expect(chordCandidates(ev({ key: 'Process', code: 'KeyQ' }))).toEqual([{ mods: [], key: 'Q' }]);
  });
});

describe('ComboMatcher', () => {
  it('matches a single chord', () => {
    const m = new ComboMatcher('Ctrl+Shift+P');
    expect(m.feed({ mods: ['Ctrl', 'Shift'], key: 'P' })).toBe('matched');
  });

  it('walks multi-chord sequences and resets on mismatch', () => {
    const m = new ComboMatcher('Ctrl+K Ctrl+S');
    expect(m.feed({ mods: ['Ctrl'], key: 'K' })).toBe('pending');
    expect(m.feed({ mods: ['Ctrl'], key: 'X' })).toBe('failed');
    expect(m.progress).toBe(0);
    expect(m.feed({ mods: ['Ctrl'], key: 'K' })).toBe('pending');
    expect(m.feed({ mods: ['Ctrl'], key: 'S' })).toBe('matched');
  });

  it('accepts any candidate of a multi-reading keypress', () => {
    const m = new ComboMatcher('$');
    const candidates = chordCandidates(ev({ key: '$', code: 'Digit4', shiftKey: true }));
    expect(m.feed(candidates)).toBe('matched');
  });

  it('resets cleanly after a match (reusable)', () => {
    const m = new ComboMatcher('G G');
    m.feed({ mods: [], key: 'G' });
    expect(m.feed({ mods: [], key: 'G' })).toBe('matched');
    expect(m.feed({ mods: [], key: 'G' })).toBe('pending');
    m.reset();
    expect(m.progress).toBe(0);
  });
});

describe('isBrowserReserved', () => {
  it('flags close/new-tab combos on both platforms', () => {
    expect(isBrowserReserved('Ctrl+W')).toBe(true);
    expect(isBrowserReserved('Ctrl+Shift+W')).toBe(true);
    expect(isBrowserReserved('Ctrl+T')).toBe(true);
    expect(isBrowserReserved('Meta+Q')).toBe(true);
    expect(isBrowserReserved('Meta+M')).toBe(true);
  });

  it('allows normal combos and tolerates bad input', () => {
    expect(isBrowserReserved('Ctrl+Shift+P')).toBe(false);
    expect(isBrowserReserved('W')).toBe(false);
    expect(isBrowserReserved('not a combo +++')).toBe(false);
  });
});

describe('displayCombo', () => {
  it('renders standard and mac symbol styles', () => {
    expect(displayCombo('Ctrl+Shift+P', {})).toBe('Ctrl+Shift+P');
    expect(displayCombo('Meta+Alt+F', { mac: true })).toBe('⌥⌘F');
  });

  it('renders vim notation', () => {
    expect(displayCombo('D D', { vim: true })).toBe('d d');
    expect(displayCombo('Shift+G', { vim: true })).toBe('G');
    expect(displayCombo('Ctrl+R', { vim: true })).toBe('Ctrl+R');
    expect(displayCombo('$', { vim: true })).toBe('$');
  });
});

describe('comboForPlatform', () => {
  it('translates Ctrl to Cmd by default on mac', () => {
    expect(comboForPlatform({ combo: 'Ctrl+K Ctrl+S' }, true)).toBe('Meta+K Meta+S');
    expect(comboForPlatform({ combo: 'Ctrl+Shift+P' }, true)).toBe('Shift+Meta+P');
  });

  it('prefers an explicit mac override', () => {
    expect(comboForPlatform({ combo: 'Ctrl+L', mac: 'Meta+K' }, true)).toBe('Meta+K');
  });

  it('returns the stored combo off mac', () => {
    expect(comboForPlatform({ combo: 'Ctrl+L', mac: 'Meta+K' }, false)).toBe('Ctrl+L');
  });

  it('deduplicates when Ctrl+Meta both present', () => {
    expect(comboForPlatform({ combo: 'Ctrl+Meta+F' }, true)).toBe('Meta+F');
  });
});

describe('chordsEqual', () => {
  it('compares key and modifier lists', () => {
    expect(chordsEqual({ mods: ['Ctrl'], key: 'A' }, { mods: ['Ctrl'], key: 'A' })).toBe(true);
    expect(chordsEqual({ mods: ['Ctrl'], key: 'A' }, { mods: ['Alt'], key: 'A' })).toBe(false);
    expect(chordsEqual({ mods: [], key: 'A' }, { mods: ['Ctrl'], key: 'A' })).toBe(false);
  });
});
