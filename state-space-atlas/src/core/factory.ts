import { createBlocks } from './blocks';
import { createHanoi } from './hanoi';
import { PuzzleError, type Puzzle, type PuzzleDef } from './puzzle';
import { createTiles } from './tiles';

/** Build a puzzle from its definition, validating it. Throws PuzzleError. */
export function createPuzzle(def: PuzzleDef): Puzzle {
  if (!def || typeof def !== 'object') throw new PuzzleError('Puzzle definition must be an object');
  switch (def.kind) {
    case 'hanoi':
      return createHanoi(def) as Puzzle;
    case 'tiles':
      return createTiles(def) as Puzzle;
    case 'blocks':
      return createBlocks(def) as Puzzle;
    default:
      throw new PuzzleError(`Unknown puzzle kind '${String((def as { kind?: unknown }).kind)}' (use hanoi, tiles or blocks)`);
  }
}

/** Parse a JSON definition typed in by a student or instructor. */
export function parsePuzzleDef(text: string): PuzzleDef {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new PuzzleError(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PuzzleError('The definition must be a JSON object');
  }
  return parsed as PuzzleDef;
}
