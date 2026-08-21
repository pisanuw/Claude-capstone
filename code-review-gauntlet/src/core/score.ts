import type { PlantedDefect, Puzzle, RoundResult } from './types';

export const POINTS_PER_DEFECT = 100;
export const FALSE_POSITIVE_PENALTY = 25;
export const MAX_TIME_BONUS = 40;

/**
 * Grade a submitted round. A defect counts as found when its line is
 * annotated; annotated lines with no defect cost a flat penalty (spraying
 * every line must not be a winning strategy). The time bonus only pays out
 * on a full sweep, so speed never beats correctness.
 */
export function scoreRound(puzzle: Puzzle, annotatedLines: number[], secondsLeft: number): RoundResult {
  const annotations = new Set(annotatedLines);
  const defectLines = new Set(puzzle.defects.map((d) => d.line));

  const found: PlantedDefect[] = [];
  const missed: PlantedDefect[] = [];
  for (const defect of puzzle.defects) {
    (annotations.has(defect.line) ? found : missed).push(defect);
  }
  const falsePositives = [...annotations].filter((line) => !defectLines.has(line)).sort((a, b) => a - b);

  const allFound = missed.length === 0;
  const clampedLeft = Math.max(0, Math.min(secondsLeft, puzzle.timeLimit));
  const timeBonus = allFound ? Math.round((MAX_TIME_BONUS * clampedLeft) / puzzle.timeLimit) : 0;
  const score = Math.max(
    0,
    found.length * POINTS_PER_DEFECT - falsePositives.length * FALSE_POSITIVE_PENALTY + timeBonus,
  );

  const perfect = allFound && falsePositives.length === 0;
  const ratio = score / (puzzle.defects.length * POINTS_PER_DEFECT);
  let grade: RoundResult['grade'];
  if (perfect) grade = 'S';
  else if (ratio >= 0.8) grade = 'A';
  else if (ratio >= 0.5) grade = 'B';
  else if (score > 0) grade = 'C';
  else grade = 'D';

  return { score, grade, found, missed, falsePositives, timeBonus };
}
