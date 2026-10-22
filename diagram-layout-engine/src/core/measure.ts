// Text measurement. Layout needs label sizes before anything is drawn; the
// browser passes a canvas-backed measurer, tests and the benchmark use this
// deterministic approximation of a 14px sans-serif font.

export interface TextMeasurer {
  /** Width in px of one line of text. */
  width(text: string): number;
  /** Height in px of one line. */
  lineHeight: number;
}

export const FONT_SIZE = 14;
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function charEm(ch: string): number {
  if (ch === ' ') return 0.28;
  if ("ijl.,:;'|!`".includes(ch)) return 0.27;
  if ('frtI()[]{}/\\-"'.includes(ch)) return 0.36;
  if ('mwMW@%'.includes(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[a-z]/.test(ch)) return 0.53;
  // Wide scripts (CJK, emoji) take roughly a full em.
  return ch.codePointAt(0)! > 0x2e80 ? 1 : 0.6;
}

export const approxMeasurer: TextMeasurer = {
  width(text: string): number {
    let em = 0;
    for (const ch of text) em += charEm(ch);
    return Math.ceil(em * FONT_SIZE);
  },
  lineHeight: Math.round(FONT_SIZE * 1.3),
};

export interface TextBox {
  lines: string[];
  width: number;
  height: number;
}

export function measureLabel(label: string, m: TextMeasurer): TextBox {
  const lines = label === '' ? [] : label.split('\n');
  const width = lines.reduce((w, l) => Math.max(w, m.width(l)), 0);
  return { lines, width, height: lines.length * m.lineHeight };
}
