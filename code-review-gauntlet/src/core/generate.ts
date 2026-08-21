import type { Mutation, PlantedDefect, Puzzle, Template, Tier } from './types';
import { hashString, mulberry32, type Rng } from './rng';
import { TEMPLATES } from '../data/templates';

/** Seconds on the clock per tier. */
export const TIME_LIMITS: Record<Tier, number> = {
  novice: 90,
  intermediate: 120,
  expert: 150,
};

/** Tiers a puzzle of the given tier may draw filler defects from. */
const ALLOWED: Record<Tier, Tier[]> = {
  novice: ['novice'],
  intermediate: ['novice', 'intermediate'],
  expert: ['novice', 'intermediate', 'expert'],
};

function poolFor(template: Template, tier: Tier): Mutation[] {
  return template.mutations.filter((m) => ALLOWED[tier].includes(m.tier));
}

/** Templates that can host a puzzle of this tier (need >=1 exact-tier defect). */
export function eligibleTemplates(tier: Tier, templates: Template[] = TEMPLATES): Template[] {
  return templates.filter((t) => t.mutations.some((m) => m.tier === tier));
}

/** How many defects a round plants, before pool-size clamping. */
function defectCount(tier: Tier, rng: Rng): number {
  if (tier === 'novice') return 1 + rng.int(2); // 1-2
  return 2 + rng.int(2); // 2-3
}

function applyMutation(code: string[], mutation: Mutation): { code: string[]; line: number } {
  const index = code.indexOf(mutation.find);
  if (index === -1) {
    throw new Error(`mutation ${mutation.id}: find line not present`);
  }
  const next = [...code];
  next[index] = mutation.replace;
  return { code: next, line: index + 1 };
}

/**
 * Deterministically build a puzzle from a seed. Picks an eligible template,
 * guarantees at least one defect of the requested tier, fills the rest from
 * the allowed tier pool, and never plants two defects on the same line.
 */
export function generatePuzzle(seed: number, tier: Tier, templates: Template[] = TEMPLATES): Puzzle {
  const rng = mulberry32(seed);
  const eligible = eligibleTemplates(tier, templates);
  if (eligible.length === 0) throw new Error(`no templates for tier ${tier}`);
  const template = rng.pick(eligible);

  const anchor = rng.pick(template.mutations.filter((m) => m.tier === tier));
  const chosen: Mutation[] = [anchor];
  const usedLines = new Set([anchor.find]);

  const wanted = defectCount(tier, rng);
  const fillers = rng.shuffle(poolFor(template, tier));
  for (const mutation of fillers) {
    if (chosen.length >= wanted) break;
    if (usedLines.has(mutation.find)) continue;
    chosen.push(mutation);
    usedLines.add(mutation.find);
  }

  let code = template.code;
  const defects: PlantedDefect[] = [];
  for (const mutation of chosen) {
    const applied = applyMutation(code, mutation);
    code = applied.code;
    defects.push({
      mutationId: mutation.id,
      category: mutation.category,
      tier: mutation.tier,
      title: mutation.title,
      explanation: mutation.explanation,
      fix: mutation.fix,
      line: applied.line,
    });
  }
  defects.sort((a, b) => a.line - b.line);

  return {
    seed,
    templateId: template.id,
    language: template.language,
    title: template.title,
    tier,
    timeLimit: TIME_LIMITS[tier],
    code,
    defects,
  };
}

/** The shared daily challenge: same puzzle for everyone, no server needed. */
export function dailyPuzzle(isoDay: string, templates: Template[] = TEMPLATES): Puzzle {
  const seed = hashString(`gauntlet-daily-${isoDay}`);
  const tier: Tier = (['novice', 'intermediate', 'expert'] as const)[seed % 3];
  return generatePuzzle(seed, tier, templates);
}
