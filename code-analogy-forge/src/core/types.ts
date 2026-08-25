/** The four audience calibrations every analogy is written for. */
export type Audience = 'child' | 'highschool' | 'undergrad' | 'adult';

export const AUDIENCES: readonly Audience[] = ['child', 'highschool', 'undergrad', 'adult'];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  child: 'Curious child',
  highschool: 'High school student',
  undergrad: 'CS undergraduate',
  adult: 'Non-technical adult',
};

/** One "this maps to that" row shown under an analogy. */
export interface MappingPair {
  code: string;
  analog: string;
}

/** A single analogy: one concept explained through one everyday domain. */
export interface Analogy {
  /** Stable id, `${conceptId}--${domain}`. Share links and the library key off it. */
  id: string;
  domain: string;
  domainLabel: string;
  title: string;
  maps: MappingPair[];
  text: Record<Audience, string>;
}

/** A CS concept with (at least) three analogies from distinct domains. */
export interface Concept {
  id: string;
  name: string;
  /** One-line formal description shown next to the friendly name. */
  tagline: string;
  analogies: Analogy[];
}

/** Result of running the concept detector over pasted code or prose. */
export interface Detection {
  conceptId: string;
  score: number;
  /** Human-readable reasons, e.g. "calls itself (fib)" or "mentions \"recursion\"". */
  evidence: string[];
}

/** A card saved to the personal library (localStorage). */
export interface SavedAnalogy {
  /** Unique per save, not per analogy: the same card can be saved twice with different tags. */
  id: string;
  analogyId: string;
  conceptId: string;
  audience: Audience;
  savedAt: string;
  tags: string[];
  note: string;
}
