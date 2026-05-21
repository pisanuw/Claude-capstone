/**
 * Color parsing and WCAG contrast math. Pure, dependency-free.
 *
 * Supports hex (#rgb, #rrggbb), rgb()/rgba(), and the common CSS named colors.
 * This is deliberately small: it exists to power the inline-style contrast
 * heuristic, not to be a full CSS color engine.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  lime: '#00ff00',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  olive: '#808000',
};

/** Parse a CSS color string into RGB, or null if unsupported/transparent. */
export function parseColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'inherit' || value === 'currentcolor') {
    return null;
  }

  const named = NAMED[value];
  const hexSource = named ?? value;

  if (hexSource.startsWith('#')) return parseHex(hexSource);

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    const [r, g, b] = parts;
    return clampRgb({
      r: Number(r),
      g: Number(g),
      b: Number(b),
    });
  }
  return null;
}

function parseHex(hex: string): Rgb | null {
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const num = Number.parseInt(h, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function clampRgb(c: Rgb): Rgb | null {
  if ([c.r, c.g, c.b].some((v) => Number.isNaN(v))) return null;
  const clamp = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));
  return { r: clamp(c.r), g: clamp(c.g), b: clamp(c.b) };
}

/** Relative luminance per WCAG 2.x definition. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colors, from 1 (none) to 21 (black/white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Extract a single declaration value from an inline style string. */
export function styleValue(style: string, property: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
  const match = style.match(re);
  return match ? match[1].trim() : null;
}
