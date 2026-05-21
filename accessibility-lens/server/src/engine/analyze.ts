import { JSDOM } from 'jsdom';
import type {
  Issue,
  Report,
  Severity,
  ProfileScore,
  DisabilityProfile,
} from './types.js';
import { ALL_PROFILES, SEVERITY_ORDER } from './types.js';
import { ALL_RULES } from './rules/index.js';
import { buildReadingOrder } from './screenReaderOrder.js';

/** Penalty weight applied to the score for each issue, by severity. */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  minor: 3,
  moderate: 7,
  serious: 12,
  critical: 20,
};

export interface AnalyzeOptions {
  /** Rules to run; defaults to the full registry. Injectable for testing. */
  rules?: typeof ALL_RULES;
}

/**
 * Analyze a string of HTML and produce a full Report. Pure and synchronous:
 * no network, no clock except the caller-provided fetch time.
 */
export function analyzeHtml(
  html: string,
  url: string,
  fetchedAt: string,
  options: AnalyzeOptions = {},
): Report {
  const rules = options.rules ?? ALL_RULES;
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const issues: Issue[] = [];
  for (const rule of rules) {
    issues.push(...rule.evaluate(doc));
  }
  issues.sort(bySeverityDesc);

  const summary = countBySeverity(issues);
  const profileScores = scoreProfiles(issues);
  const score = overallScore(issues);
  const readingOrder = buildReadingOrder(doc);

  return {
    url,
    fetchedAt,
    pageTitle: doc.querySelector('title')?.textContent?.trim() || null,
    lang: doc.documentElement.getAttribute('lang')?.trim() || null,
    issues,
    summary,
    profileScores,
    readingOrder,
    score,
  };
}

function bySeverityDesc(a: Issue, b: Issue): number {
  return SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
}

function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const summary: Record<Severity, number> = {
    minor: 0,
    moderate: 0,
    serious: 0,
    critical: 0,
  };
  for (const issue of issues) summary[issue.severity] += 1;
  return summary;
}

/** Convert a penalty total into a 0-100 score, clamped. */
function penaltyToScore(penalty: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function overallScore(issues: Issue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  return penaltyToScore(penalty);
}

function scoreProfiles(issues: Issue[]): ProfileScore[] {
  return ALL_PROFILES.map((profile: DisabilityProfile) => {
    const relevant = issues.filter((i) => i.profiles.includes(profile));
    const penalty = relevant.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
    return {
      profile,
      score: penaltyToScore(penalty),
      issueCount: relevant.length,
    };
  });
}
