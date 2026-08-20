import type { DiffResult, SchemaModel, SourceKind } from './types.js';
import { detectKind, parseInput } from './parse/detect.js';
import { diffModels } from './diff.js';

export interface Analysis {
  before: SchemaModel;
  after: SchemaModel;
  result: DiffResult;
  /** The kind actually used, after auto-detection. */
  kind: SourceKind;
}

/**
 * The one call the UI makes: parse both sides (auto-detecting the format from
 * the "after" text when asked to) and diff them.
 */
export function analyze(beforeText: string, afterText: string, kind: SourceKind | 'auto'): Analysis {
  const resolved = kind === 'auto' ? detectKind(afterText.trim() ? afterText : beforeText) : kind;
  const before = parseInput(beforeText, resolved);
  const after = parseInput(afterText, resolved);
  return { before, after, result: diffModels(before, after), kind: resolved };
}
