/**
 * Key-combo model.
 *
 * A combo is a sequence of chords ("Ctrl+K Ctrl+S" is two chords). A chord is
 * modifiers plus one key, canonically ordered Ctrl, Alt, Shift, Meta.
 *
 * Matching is layout-aware in a deliberate way:
 * - Letters and digits come from `event.code` (KeyA…KeyZ, Digit0…Digit9), so
 *   Shift is tracked as a modifier ("Shift+G" is g with shift held).
 * - Printable punctuation comes from `event.key` and swallows Shift, so "$"
 *   matches Shift+4 on a US layout and whatever produces "$" elsewhere.
 */

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
export type Modifier = (typeof MOD_ORDER)[number];

const MOD_ALIASES: Record<string, Modifier> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
  super: 'Meta',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  space: 'Space',
  spacebar: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  plus: '+',
};

const NAMED_KEYS = new Set([
  'Escape',
  'Enter',
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

export interface Chord {
  mods: Modifier[];
  key: string;
}

/** Parse one chord like "Ctrl+Shift+P" or "$". Throws on invalid input. */
export function parseChord(text: string): Chord {
  const raw = text.trim();
  if (raw === '') throw new Error('empty chord');
  // A trailing "+" means the key itself is "+" (e.g. "Ctrl++").
  let parts: string[];
  if (raw.endsWith('++')) {
    parts = raw.slice(0, -2).split('+').filter(Boolean).concat('+');
  } else if (raw === '+') {
    parts = ['+'];
  } else {
    parts = raw.split('+').filter(Boolean);
  }
  const mods: Modifier[] = [];
  let key: string | null = null;
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (mod) {
      if (!mods.includes(mod)) mods.push(mod);
      continue;
    }
    if (key !== null) throw new Error(`two keys in one chord: "${text}"`);
    key = normalizeKeyName(part);
  }
  if (key === null) throw new Error(`chord has modifiers but no key: "${text}"`);
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return { mods, key };
}

/** Normalize a key name from library text into canonical form. */
export function normalizeKeyName(part: string): string {
  const alias = KEY_ALIASES[part.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1[0-2])$/i.test(part)) return part.toUpperCase();
  if (/^[a-z]$/i.test(part)) return part.toUpperCase();
  if (/^[0-9]$/.test(part)) return part;
  if (part.length === 1) return part; // punctuation, verbatim
  if (NAMED_KEYS.has(part)) return part;
  // Accept CamelCase named keys case-insensitively.
  for (const name of NAMED_KEYS) {
    if (name.toLowerCase() === part.toLowerCase()) return name;
  }
  throw new Error(`unknown key "${part}"`);
}

/** Parse a full combo (space-separated chords). Throws on invalid input. */
export function parseCombo(text: string): Chord[] {
  const chords = text.trim().split(/\s+/).filter(Boolean).map(parseChord);
  if (chords.length === 0) throw new Error('empty combo');
  if (chords.length > 4) throw new Error(`combo too long (${chords.length} chords)`);
  return chords;
}

export function formatChord(chord: Chord): string {
  return [...chord.mods, chord.key].join('+');
}

export function formatCombo(chords: Chord[]): string {
  return chords.map(formatChord).join(' ');
}

/** Subset of KeyboardEvent that matters for chord capture. */
export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const PURE_MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph']);

/** Physical-key characters for common punctuation, per `event.code`. */
const PUNCT_CODES: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

function withMods(e: KeyEventLike, key: string, shiftAsModifier: boolean): Chord {
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && shiftAsModifier) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  return { mods, key };
}

/**
 * The chord(s) a keydown event can represent. Usually one; two when the
 * physical-key reading and the produced-character reading differ, so both
 * "Ctrl+Shift+[" (code-based, Shift as modifier) and "$" (key-based, Shift
 * folded into the character) styles of combo can match. Empty for
 * pure-modifier presses, dead keys, and IME input.
 */
export function chordCandidates(e: KeyEventLike): Chord[] {
  if (PURE_MODIFIER_KEYS.has(e.key)) return [];

  const out: Chord[] = [];
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^Digit([0-9])$/.exec(e.code);
  const punct = PUNCT_CODES[e.code];

  if (letter) {
    out.push(withMods(e, letter[1], true));
  } else if (digit) {
    out.push(withMods(e, digit[1], true));
  } else if (punct) {
    out.push(withMods(e, punct, true));
  }

  if (e.key === ' ') {
    out.push(withMods(e, 'Space', true));
  } else if (e.key.length === 1 && !/^[a-zA-Z]$/.test(e.key)) {
    // Produced-character reading: Shift is part of typing the character.
    const keyChord = withMods(e, e.key, false);
    if (!out.some((c) => chordsEqual(c, keyChord))) out.push(keyChord);
  } else if (out.length === 0 && NAMED_KEYS.has(e.key)) {
    out.push(withMods(e, e.key, true));
  }

  return out;
}

export function chordsEqual(a: Chord, b: Chord): boolean {
  return a.key === b.key && a.mods.length === b.mods.length && a.mods.every((m, i) => b.mods[i] === m);
}

export type MatchState = 'pending' | 'matched' | 'failed';

/** Stateful matcher for multi-chord combos. */
export class ComboMatcher {
  private readonly target: Chord[];
  private position = 0;

  constructor(combo: string | Chord[]) {
    this.target = typeof combo === 'string' ? parseCombo(combo) : combo;
  }

  /**
   * Feed one keypress (as its candidate chords); returns the resulting
   * state. 'failed' resets progress.
   */
  feed(input: Chord | Chord[]): MatchState {
    const candidates = Array.isArray(input) ? input : [input];
    if (candidates.some((c) => chordsEqual(c, this.target[this.position]))) {
      this.position += 1;
      if (this.position === this.target.length) {
        this.position = 0;
        return 'matched';
      }
      return 'pending';
    }
    this.position = 0;
    return 'failed';
  }

  reset(): void {
    this.position = 0;
  }

  get progress(): number {
    return this.position;
  }
}

/**
 * Combos the browser reserves at the OS/tab level: `preventDefault` cannot
 * stop them, so they cannot be practiced in a web page.
 */
export function isBrowserReserved(combo: string): boolean {
  let chords: Chord[];
  try {
    chords = parseCombo(combo);
  } catch {
    return false;
  }
  return chords.some((c) => {
    const ctrl = c.mods.includes('Ctrl');
    const meta = c.mods.includes('Meta');
    const shift = c.mods.includes('Shift');
    if ((ctrl || meta) && ['W', 'T', 'N', 'Q'].includes(c.key)) return true;
    // macOS minimize/hide; with Shift these are ordinary app shortcuts.
    if (meta && !shift && ['M', 'H'].includes(c.key)) return true;
    return false;
  });
}

export interface DisplayOptions {
  /** Use macOS modifier symbols (⌃⌥⇧⌘). */
  mac?: boolean;
  /** Vim notation: bare letters lowercase, Shift+letter as the capital. */
  vim?: boolean;
}

/** Human-readable form of a combo. */
export function displayCombo(combo: string, opts: DisplayOptions = {}): string {
  const chords = parseCombo(combo);
  return chords
    .map((c) => {
      if (opts.vim && /^[A-Z]$/.test(c.key)) {
        if (c.mods.length === 0) return c.key.toLowerCase();
        if (c.mods.length === 1 && c.mods[0] === 'Shift') return c.key;
      }
      const parts = [...c.mods, c.key];
      if (!opts.mac) return parts.join('+');
      return parts.map((p) => ({ Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' })[p] ?? p).join('');
    })
    .join(' ');
}

/** Translate a stored combo for the current platform. */
export function comboForPlatform(shortcut: { combo: string; mac?: string }, mac: boolean): string {
  if (!mac) return shortcut.combo;
  if (shortcut.mac) return shortcut.mac;
  // Default macOS translation: Ctrl → Cmd.
  return formatCombo(
    parseCombo(shortcut.combo).map((c) => ({
      key: c.key,
      mods: c.mods
        .map((m): Modifier => (m === 'Ctrl' ? 'Meta' : m))
        .filter((m, i, arr) => arr.indexOf(m) === i)
        .sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b)),
    })),
  );
}
