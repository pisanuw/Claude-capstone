import type { Schema, SchemaFormat } from './types.js';
import { parseSchema, detectFormat } from './parse/index.js';
import { classify } from './classify.js';
import type { Classification } from './classify.js';
import { lint } from './lint.js';
import type { Finding } from './lint.js';
import { narrate } from './narrate.js';
import type { Narrative } from './narrate.js';

export interface Analysis {
  format: SchemaFormat;
  schema: Schema;
  classification: Classification;
  narrative: Narrative;
  findings: Finding[];
}

/** Runs the full pipeline: parse -> classify -> narrate -> lint. */
export function analyze(input: string, format?: SchemaFormat): Analysis {
  const chosen = format ?? detectFormat(input);
  const schema = parseSchema(input, chosen);
  const classification = classify(schema);
  const narrative = narrate(schema, classification);
  const findings = lint(schema, classification);
  return { format: chosen, schema, classification, narrative, findings };
}

export { detectFormat };
