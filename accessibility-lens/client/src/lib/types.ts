/**
 * Shape of the report returned by POST /api/scan. Kept in sync with the
 * server's engine/types.ts. (In a larger setup these would live in a shared
 * package; for this project a small mirrored copy keeps the client buildable
 * on its own. See ASSUMPTIONS.md.)
 */

export type DisabilityProfile =
  | 'low-vision'
  | 'color-blindness'
  | 'keyboard-only'
  | 'screen-reader';

export type Severity = 'minor' | 'moderate' | 'serious' | 'critical';

export interface Issue {
  ruleId: string;
  title: string;
  severity: Severity;
  wcagCriterion: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  profiles: DisabilityProfile[];
  impact: string;
  selector: string;
  snippet: string;
  suggestedFix: string;
}

export interface ReadingOrderNode {
  role: string;
  text: string;
  level?: number;
}

export interface ProfileScore {
  profile: DisabilityProfile;
  score: number;
  issueCount: number;
}

export interface Report {
  url: string;
  fetchedAt: string;
  pageTitle: string | null;
  lang: string | null;
  issues: Issue[];
  summary: Record<Severity, number>;
  profileScores: ProfileScore[];
  readingOrder: ReadingOrderNode[];
  score: number;
}
