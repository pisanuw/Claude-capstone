import type { Schema, Entity } from './types.js';
import type { Classification, Cardinality } from './classify.js';
import {
  humanizeEntity,
  humanizeEntityPlural,
  humanizeField,
} from './vocabulary.js';

/**
 * Renders the parsed IR and its classification into an entity-relationship
 * narrative. This is the "plain-English story" the app centers on. It is
 * built from templates over the structured facts, so it never invents columns
 * or relationships that are not in the schema.
 */

export interface EntityNarrative {
  name: string;
  human: string;
  summary: string;
  fieldNotes: string[];
  relationshipNotes: string[];
}

export interface Narrative {
  overview: string;
  entities: EntityNarrative[];
}

export function narrate(schema: Schema, classification: Classification): Narrative {
  const entities = schema.entities.map((e) => narrateEntity(e, classification));
  return { overview: overviewParagraph(schema, classification), entities };
}

function overviewParagraph(schema: Schema, classification: Classification): string {
  const n = schema.entities.length;
  if (n === 0) return 'No tables or models were found in the input.';

  const roleValues = [...classification.roles.values()];
  const joins = roleValues.filter((r) => r.isJoinTable);
  const lookups = roleValues.filter((r) => r.isLookupTable);
  const core = schema.entities.filter((e) => {
    const role = classification.roles.get(e.name.toLowerCase());
    return !role?.isJoinTable && !role?.isLookupTable;
  });

  const parts: string[] = [];
  parts.push(
    `This schema defines ${count(n, 'entity', 'entities')} connected by ${count(
      schema.relationships.length,
      'relationship',
      'relationships',
    )}.`,
  );

  if (core.length > 0) {
    const names = core.slice(0, 4).map((e) => humanizeEntityPlural(e.name));
    const tail = core.length > 4 ? `, and ${core.length - 4} more` : '';
    parts.push(`The core subjects are ${joinList(names)}${tail}.`);
  }
  if (joins.length > 0) {
    parts.push(
      `${cap(count(joins.length, 'table', 'tables'))} (${joins
        .map((r) => r.entity)
        .join(', ')}) act as join tables linking other entities in many-to-many relationships.`,
    );
  }
  if (lookups.length > 0) {
    parts.push(
      `${cap(count(lookups.length, 'table', 'tables'))} (${lookups
        .map((r) => r.entity)
        .join(', ')}) look like reference/lookup tables holding fixed sets of values.`,
    );
  }
  return parts.join(' ');
}

function narrateEntity(
  entity: Entity,
  classification: Classification,
): EntityNarrative {
  const human = humanizeEntity(entity.name);
  const role = classification.roles.get(entity.name.toLowerCase());

  let summary: string;
  if (entity.fields.length === 0) {
    summary = `${cap(human)} is declared but has no readable columns.`;
  } else if (role?.isJoinTable) {
    summary = `${cap(human)} is a join table: each row links ${joinList(
      role.referencesTo.map((t) => humanizeEntity(t)),
    )}.`;
  } else if (role?.isLookupTable) {
    summary = `${cap(human)} is a small reference table listing the allowed ${humanizeEntityPlural(
      entity.name,
    )}.`;
  } else {
    const key = entity.primaryKey.length > 0 ? entity.primaryKey.join(', ') : 'no primary key';
    summary = `Each row represents one ${human}, identified by ${key}. It has ${count(
      entity.fields.length,
      'attribute',
      'attributes',
    )}.`;
  }

  const fieldNotes = entity.fields.slice(0, 40).map((f) => describeField(entity, f));
  const relationshipNotes = describeRelationships(entity, classification);

  return { name: entity.name, human, summary, fieldNotes, relationshipNotes };
}

function describeField(entity: Entity, field: import('./types.js').Field): string {
  const human = humanizeField(field.name);
  const bits: string[] = [];
  bits.push(`**${field.name}** (${field.rawType})`);

  const traits: string[] = [];
  if (field.isPrimaryKey) traits.push('primary key');
  if (field.references) traits.push(`references ${field.references.entity}`);
  else if (field.isUnique) traits.push('unique');
  if (!field.nullable && !field.isPrimaryKey) traits.push('required');
  if (field.nullable && !field.isPrimaryKey) traits.push('optional');
  if (field.hasDefault) traits.push('has a default');
  if (field.enumValues && field.enumValues.length > 0) {
    traits.push(`one of ${field.enumValues.slice(0, 6).join(', ')}`);
  }

  const desc = field.comment ? field.comment : `the ${human} of the ${humanizeEntity(entity.name)}`;
  return `${bits.join(' ')} - ${desc}${traits.length ? ` (${traits.join(', ')})` : ''}.`;
}

function describeRelationships(entity: Entity, classification: Classification): string[] {
  const notes: string[] = [];
  const name = entity.name.toLowerCase();

  for (const rel of classification.relationships) {
    if (rel.from.toLowerCase() === name) {
      const opt = rel.optional ? 'optionally ' : '';
      notes.push(
        `Each ${humanizeEntity(entity.name)} ${opt}belongs to ${article(
          humanizeEntity(rel.to),
        )} (${phraseCardinality(rel.cardinality)}, via ${rel.fromFields.join(', ')}).`,
      );
    }
  }
  for (const rel of classification.relationships) {
    if (rel.to.toLowerCase() === name) {
      const many = rel.cardinality === 'one-to-one';
      notes.push(
        many
          ? `Each ${humanizeEntity(entity.name)} has at most one ${humanizeEntity(rel.from)}.`
          : `A ${humanizeEntity(entity.name)} can have many ${humanizeEntityPlural(rel.from)}.`,
      );
    }
  }
  return notes;
}

function phraseCardinality(c: Cardinality): string {
  switch (c) {
    case 'one-to-one':
      return 'one-to-one';
    case 'one-to-many':
      return 'one-to-many';
    case 'many-to-one':
      return 'many-to-one';
    case 'many-to-many':
      return 'many-to-many';
  }
}

// --- small text helpers -----------------------------------------------------

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return 'nothing';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function article(word: string): string {
  // Choose by sound, not spelling: "a user"/"a URL" (consonant onset) but
  // "an hour". A short exception list covers the common data-model words.
  const lower = word.toLowerCase();
  const anException = /^(hour|honest|heir|x[- ]?ref|xml|html|sql|fa?q)/.test(lower);
  const aException = /^(u[bcdfglmnprstz]|use|uni|uri|url|uuid|one|once)/.test(lower);
  const vowelStart = /^[aeiou]/.test(lower);
  const useAn = anException || (vowelStart && !aException);
  return useAn ? `an ${word}` : `a ${word}`;
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
