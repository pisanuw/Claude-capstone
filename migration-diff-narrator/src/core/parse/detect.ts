import type { SchemaModel, SourceKind } from '../types.js';
import { parseSql } from './sql.js';
import { parseTypescript } from './typescript.js';

/** Guesses whether pasted text is SQL DDL or TypeScript declarations. */
export function detectKind(input: string): SourceKind {
  const text = input.trim();
  let sqlScore = 0;
  let tsScore = 0;

  if (/\bcreate\s+(temp(orary)?\s+)?table\b/i.test(text)) sqlScore += 4;
  if (/\balter\s+table\b/i.test(text)) sqlScore += 3;
  if (/\bcreate\s+(unique\s+)?index\b/i.test(text)) sqlScore += 2;
  if (/\b(varchar|integer|bigint|primary\s+key|not\s+null)\b/i.test(text)) sqlScore += 1;

  if (/\binterface\s+[A-Za-z_$][\w$]*\s*(extends\s+[^{]+)?\{/.test(text)) tsScore += 4;
  if (/\btype\s+[A-Za-z_$][\w$]*\s*(<[^>]*>)?\s*=\s*\{/.test(text)) tsScore += 4;
  if (/^\s*(export\s+)?(interface|type)\b/m.test(text)) tsScore += 2;
  if (/[\w$]\??\s*:\s*(string|number|boolean|Date)\b/.test(text)) tsScore += 2;

  return tsScore > sqlScore ? 'typescript' : 'sql';
}

/** Parses with an explicit kind, or auto-detects when kind is 'auto'. */
export function parseInput(input: string, kind: SourceKind | 'auto'): SchemaModel {
  const resolved = kind === 'auto' ? detectKind(input) : kind;
  return resolved === 'typescript' ? parseTypescript(input) : parseSql(input);
}
