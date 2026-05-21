import type { DisabilityProfile, Severity } from './types.js';

export interface ProfileMeta {
  id: DisabilityProfile;
  label: string;
  /** One-line description of who this represents. */
  blurb: string;
  /** Short emoji/glyph used as a non-color cue (paired with text always). */
  glyph: string;
}

export const PROFILES: ProfileMeta[] = [
  {
    id: 'screen-reader',
    label: 'Screen reader',
    blurb: 'A blind user hears the page read aloud as a linear stream.',
    glyph: 'SR',
  },
  {
    id: 'low-vision',
    label: 'Low vision',
    blurb: 'A user who needs to zoom and relies on strong contrast.',
    glyph: 'LV',
  },
  {
    id: 'color-blindness',
    label: 'Color blindness',
    blurb: 'A user who cannot distinguish certain hues.',
    glyph: 'CB',
  },
  {
    id: 'keyboard-only',
    label: 'Keyboard only',
    blurb: 'A user who navigates entirely by Tab and Enter, no mouse.',
    glyph: 'KB',
  },
];

export function profileMeta(id: DisabilityProfile): ProfileMeta {
  const found = PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown profile: ${id}`);
  return found;
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; className: string; order: number }
> = {
  critical: { label: 'Critical', className: 'text-severity-critical', order: 0 },
  serious: { label: 'Serious', className: 'text-severity-serious', order: 1 },
  moderate: { label: 'Moderate', className: 'text-severity-moderate', order: 2 },
  minor: { label: 'Minor', className: 'text-severity-minor', order: 3 },
};

/** Map a 0-100 score to a qualitative band, never relying on color alone. */
export function scoreBand(score: number): { label: string; tone: string } {
  if (score >= 90) return { label: 'Strong', tone: 'text-severity-minor' };
  if (score >= 70) return { label: 'Fair', tone: 'text-severity-moderate' };
  if (score >= 50) return { label: 'Weak', tone: 'text-severity-serious' };
  return { label: 'Failing', tone: 'text-severity-critical' };
}
