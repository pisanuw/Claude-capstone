/** Defect categories tracked by the skill radar. */
export const CATEGORIES = ['logic', 'null-safety', 'security', 'performance', 'style'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Difficulty tiers, from CS1 syntax slips to subtle production bugs. */
export const TIERS = ['novice', 'intermediate', 'expert'] as const;
export type Tier = (typeof TIERS)[number];

export type Language = 'javascript' | 'python' | 'sql';

/**
 * One plantable defect: rewrites exactly one line of the template's clean
 * code. `find` must match a template line (after trimming) exactly once, so
 * mutations stay line-stable and cannot collide unless they share a line.
 */
export interface Mutation {
  id: string;
  category: Category;
  tier: Tier;
  title: string;
  explanation: string;
  fix: string;
  find: string;
  replace: string;
}

/** A clean code scenario plus the catalogue of defects that fit it. */
export interface Template {
  id: string;
  language: Language;
  title: string;
  code: string[];
  mutations: Mutation[];
}

/** A defect as planted in a generated puzzle. */
export interface PlantedDefect {
  mutationId: string;
  category: Category;
  tier: Tier;
  title: string;
  explanation: string;
  fix: string;
  /** 1-based line number in the mutated code. */
  line: number;
}

export interface Puzzle {
  seed: number;
  templateId: string;
  language: Language;
  title: string;
  tier: Tier;
  /** Seconds on the clock for this round. */
  timeLimit: number;
  code: string[];
  defects: PlantedDefect[];
}

/** Outcome of grading one submitted round. */
export interface RoundResult {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  found: PlantedDefect[];
  missed: PlantedDefect[];
  /** Annotated lines that contain no defect. */
  falsePositives: number[];
  timeBonus: number;
}

export interface CategoryStat {
  attempts: number;
  found: number;
}

export interface Profile {
  v: 1;
  gamesPlayed: number;
  bestScore: number;
  totalScore: number;
  categories: Record<Category, CategoryStat>;
  /** ISO days on which the daily challenge was completed. */
  dailyDays: string[];
  /** Daily-challenge score per ISO day; only the first attempt counts. */
  dailyScores: Record<string, number>;
}
