/** A single trainable shortcut inside a set. */
export interface Shortcut {
  /** Stable id, unique within the set. */
  id: string;
  /** Task description shown to the player, e.g. "Go to definition". */
  task: string;
  /**
   * Canonical combo. Chords are space-separated; keys within a chord are
   * joined with `+` in the order Ctrl, Alt, Shift, Meta, key.
   * Examples: "Ctrl+Shift+P", "Ctrl+K Ctrl+S", "G G", "$".
   */
  combo: string;
  /** Optional macOS variant when it is not just Ctrl→Cmd. */
  mac?: string;
  /** Optional hint shown after a first wrong attempt. */
  hint?: string;
}

/** A named collection of shortcuts for one tool. */
export interface ShortcutSet {
  id: string;
  name: string;
  /** Tool label used for grouping in stats, e.g. "VS Code". */
  tool: string;
  version: 1;
  /** Display style for combos; "vim" shows bare letters lowercase. */
  notation?: 'vim';
  shortcuts: Shortcut[];
}

/** SM-2 scheduling state for one shortcut. */
export interface CardState {
  /** Ease factor, ≥ 1.3. */
  ef: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Current inter-repetition interval in days. */
  intervalDays: number;
  /** Day number (local days since epoch) the card is next due. */
  due: number;
  /** Times the card was failed. */
  lapses: number;
  /** Total reviews (for accuracy stats). */
  seen: number;
  /** Total correct reviews. */
  correct: number;
}

/** Everything persisted to localStorage. */
export interface Progress {
  v: 1;
  /** cards[setId][shortcutId] = state */
  cards: Record<string, Record<string, CardState>>;
  /** ISO dates (YYYY-MM-DD, local) with at least one review. */
  days: string[];
  customSets: ShortcutSet[];
  settings: {
    /** Selected set id. */
    setId: string;
    /** New cards introduced per day per set. */
    newPerDay: number;
    /** Translate Ctrl→Cmd for matching/display on macOS. */
    macMode: boolean;
  };
}
