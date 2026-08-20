import type { Column, Severity, SourceKind } from './types.js';

export interface TypeVerdict {
  severity: Severity;
  note: string;
}

/** Two raw types are "the same" if they differ only in case and spacing. */
export function sameRawType(a: Column, b: Column): boolean {
  return normalize(a.rawType) === normalize(b.rawType);
}

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Classifies a type change between two columns of the same entity.
 * The rules are deliberately conservative: when we cannot prove a change is
 * lossless it is at least a caution.
 */
export function classifyTypeChange(before: Column, after: Column, kind: SourceKind): TypeVerdict {
  if (before.family === after.family) {
    return sameFamilyChange(before, after, kind);
  }
  return crossFamilyChange(before, after, kind);
}

function sameFamilyChange(before: Column, after: Column, kind: SourceKind): TypeVerdict {
  switch (after.family) {
    case 'integer': {
      if (before.intRank !== undefined && after.intRank !== undefined) {
        if (after.intRank > before.intRank) {
          return { severity: 'safe', note: 'Widening an integer type is lossless; existing values all fit.' };
        }
        if (after.intRank < before.intRank) {
          return {
            severity: 'breaking',
            note: 'Narrowing an integer type fails (or silently truncates) once any value exceeds the new range; verify max values first.',
          };
        }
      }
      return { severity: 'caution', note: 'Integer representation changed; confirm both types cover the stored range.' };
    }
    case 'string': {
      const b = before.maxLength;
      const a = after.maxLength;
      if (b !== undefined && a !== undefined) {
        if (a > b) return { severity: 'safe', note: 'Increasing a length limit is lossless.' };
        if (a < b) {
          return {
            severity: 'breaking',
            note: `Existing values longer than ${a} characters will be rejected or truncated; check max length before applying.`,
          };
        }
      }
      if (b !== undefined && a === undefined) {
        return { severity: 'safe', note: 'Dropping the length limit (e.g. VARCHAR to TEXT) is lossless.' };
      }
      if (b === undefined && a !== undefined) {
        return {
          severity: 'breaking',
          note: `Adding a length limit rejects existing values longer than ${a} characters; check max length first.`,
        };
      }
      return { severity: 'caution', note: 'String representation changed; confirm collation and length semantics match.' };
    }
    case 'decimal': {
      const bPrec = before.maxLength;
      const aPrec = after.maxLength;
      const bScale = before.scale ?? 0;
      const aScale = after.scale ?? 0;
      if (bPrec !== undefined && aPrec !== undefined) {
        // Digits left of the point must not shrink, and scale must not shrink.
        if (aPrec - aScale >= bPrec - bScale && aScale >= bScale) {
          return { severity: 'safe', note: 'Precision and scale both grow (or hold); existing values fit.' };
        }
        return {
          severity: 'breaking',
          note: 'Reduced precision or scale rounds or rejects existing values; verify current maxima first.',
        };
      }
      return { severity: 'caution', note: 'Numeric precision changed; confirm existing values fit the new definition.' };
    }
    case 'enum': {
      const bMembers = before.members ?? [];
      const aMembers = after.members ?? [];
      if (bMembers.length > 0 && aMembers.length > 0) {
        const removed = bMembers.filter((m) => !aMembers.includes(m));
        const added = aMembers.filter((m) => !bMembers.includes(m));
        if (removed.length > 0) {
          return {
            severity: 'breaking',
            note: `Removed value${removed.length > 1 ? 's' : ''} ${removed.map((m) => `'${m}'`).join(', ')} — rows or code using ${removed.length > 1 ? 'them' : 'it'} break; migrate that data first.`,
          };
        }
        if (added.length > 0) {
          return {
            severity: 'caution',
            note:
              kind === 'typescript'
                ? 'New union members compile fine, but exhaustive switch statements over this type stop being exhaustive.'
                : 'Adding enum values is safe to apply, but readers that enumerate the old set must learn the new values.',
          };
        }
      }
      return { severity: 'caution', note: 'Enum definition changed; compare the member lists before applying.' };
    }
    default:
      return {
        severity: 'caution',
        note: 'Same type family but a different representation; confirm the two types round-trip your existing data.',
      };
  }
}

function crossFamilyChange(before: Column, after: Column, kind: SourceKind): TypeVerdict {
  const from = before.family;
  const to = after.family;

  // Lossless-ish promotions.
  if (from === 'integer' && (to === 'decimal' || to === 'float')) {
    return { severity: 'safe', note: 'Integers convert cleanly to a wider numeric type.' };
  }
  if ((from === 'integer' || from === 'decimal' || from === 'float' || from === 'boolean' || from === 'uuid') && to === 'string') {
    return {
      severity: 'caution',
      note: 'Values cast to text without loss, but comparisons and sorting become lexicographic; update code that relies on numeric semantics.',
    };
  }
  if (from === 'date' && to === 'datetime') {
    return { severity: 'safe', note: 'Dates widen to timestamps (midnight time component).' };
  }

  // Known-lossy directions.
  if ((from === 'decimal' || from === 'float') && to === 'integer') {
    return { severity: 'breaking', note: 'Fractional values are truncated or rejected; verify no value has decimals before applying.' };
  }
  if (from === 'datetime' && to === 'date') {
    return { severity: 'breaking', note: 'The time component is discarded for every existing value.' };
  }
  if (from === 'string' && (to === 'integer' || to === 'decimal' || to === 'float' || to === 'uuid' || to === 'boolean' || to === 'date' || to === 'datetime' || to === 'json')) {
    return {
      severity: 'breaking',
      note:
        kind === 'sql'
          ? 'Any value that does not parse as the new type makes the migration fail; validate and clean the column, and use an explicit USING/CAST clause.'
          : 'Every producer and consumer of this field must switch representations at the same time.',
    };
  }

  return {
    severity: 'breaking',
    note:
      kind === 'sql'
        ? 'A cross-type conversion needs an explicit cast and a data validation pass; test it on a copy of production data.'
        : 'This is an incompatible type substitution; all readers and writers of the field must change together.',
  };
}
