/**
 * Grade comparison across the scales US departments actually use: letter
 * grades (A+ to F) and decimal grade points (UW's 0.0 to 4.0). Pass/fail,
 * credit and in-progress marks have no rank, so policy checks skip them.
 */

const LETTERS: Record<string, number> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  E: 0,
  F: 0,
};

/** Grade points for a grade, or null when it has no rank (P, CR, IP, blank). */
export function gradePoints(grade: string): number | null {
  const g = grade.trim().toUpperCase();
  if (g in LETTERS) return LETTERS[g]!;
  if (/^\d(\.\d{1,2})?$/.test(g)) {
    const n = Number(g);
    return n <= 4.3 ? n : null;
  }
  return null;
}

/** True/false when both grades rank; null when either does not. */
export function meets(grade: string, min: string): boolean | null {
  const a = gradePoints(grade);
  const b = gradePoints(min);
  if (a === null || b === null) return null;
  // A+ and 4.0 both cap at 4.0; compare with a little slack for 3.7 vs "A-".
  return a + 1e-9 >= b;
}
