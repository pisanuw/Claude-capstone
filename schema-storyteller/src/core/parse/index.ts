import type { Schema, SchemaFormat } from '../types.js';
import { parseSql } from './sql.js';
import { parsePrisma } from './prisma.js';
import { parseJsonSchema } from './jsonSchema.js';

export { parseSql, parsePrisma, parseJsonSchema };

/**
 * Guesses the schema dialect from the text.
 *
 * The three formats are unambiguous in practice: JSON Schema is the only one
 * that is valid JSON, Prisma is the only one with `model X {` blocks, and SQL
 * is the only one with `CREATE TABLE`. When nothing matches we default to SQL,
 * the most common paste, and let its parser surface an empty result.
 */
export function detectFormat(input: string): SchemaFormat {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'sql';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json-schema';
    } catch {
      // Looks like JSON but is not valid; fall through to keyword sniffing.
    }
  }

  if (/^\s*(datasource|generator|model|enum)\s+[A-Za-z_]/m.test(trimmed) && !/\bCREATE\s+TABLE\b/i.test(trimmed)) {
    return 'prisma';
  }

  if (/\bCREATE\s+TABLE\b/i.test(trimmed) || /\bALTER\s+TABLE\b/i.test(trimmed)) {
    return 'sql';
  }

  if (/^\s*model\s+[A-Za-z_]/m.test(trimmed)) return 'prisma';

  return 'sql';
}

/** Parses `input`, auto-detecting the format unless `format` is given. */
export function parseSchema(input: string, format?: SchemaFormat): Schema {
  const chosen = format ?? detectFormat(input);
  switch (chosen) {
    case 'json-schema':
      return parseJsonSchema(input);
    case 'prisma':
      return parsePrisma(input);
    case 'sql':
    default:
      return parseSql(input);
  }
}
