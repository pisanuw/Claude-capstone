import type {
  Change,
  Column,
  DiffResult,
  Entity,
  IndexDef,
  SchemaModel,
  SourceKind,
} from './types.js';
import { classifyTypeChange, sameRawType } from './typeChange.js';

/**
 * Compares two parsed schema versions and produces the classified change list.
 * Every rule lives here or in typeChange.ts; there is no model call — the
 * narration is deterministic, so the same diff always gets the same verdict.
 */
export function diffModels(before: SchemaModel, after: SchemaModel): DiffResult {
  const changes: Change[] = [];
  const kind = after.kind;

  const beforeByName = new Map(before.entities.map((e) => [e.name.toLowerCase(), e]));
  const afterByName = new Map(after.entities.map((e) => [e.name.toLowerCase(), e]));

  const removedEntities = before.entities.filter((e) => !afterByName.has(e.name.toLowerCase()));
  const addedEntities = after.entities.filter((e) => !beforeByName.has(e.name.toLowerCase()));

  // Pair removed+added entities that share most column names: that is a rename.
  const renamed = new Map<Entity, Entity>();
  for (const gone of removedEntities) {
    let best: Entity | null = null;
    let bestScore = 0;
    for (const added of addedEntities) {
      if ([...renamed.values()].includes(added)) continue;
      const score = columnOverlap(gone, added);
      if (score > bestScore) {
        best = added;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0.6 && gone.columns.length > 0) {
      renamed.set(gone, best);
    }
  }

  for (const [gone, now] of renamed) {
    changes.push({
      kind: 'entity-renamed',
      severity: 'caution',
      entity: now.name,
      summary: `${entityWord(kind)} ${gone.name} renamed to ${now.name}`,
      note:
        kind === 'sql'
          ? `Write this as ALTER TABLE ${gone.name} RENAME TO ${now.name}; a drop-and-create loses all rows.`
          : `Every import site of ${gone.name} must be updated; consider a temporary alias to stage the rename.`,
      before: gone.name,
      after: now.name,
    });
    diffEntity(gone, now, kind, changes);
  }

  for (const gone of removedEntities) {
    if (renamed.has(gone)) continue;
    changes.push({
      kind: 'entity-removed',
      severity: 'breaking',
      entity: gone.name,
      summary: `${entityWord(kind)} ${gone.name} removed`,
      note:
        kind === 'sql'
          ? 'Dropping a table deletes its data irreversibly; archive the rows first and search for lingering references.'
          : 'All code referencing this type stops compiling; remove the usages first.',
      before: gone.name,
    });
  }

  for (const added of addedEntities) {
    if ([...renamed.values()].includes(added)) continue;
    changes.push({
      kind: 'entity-added',
      severity: 'safe',
      entity: added.name,
      summary: `${entityWord(kind)} ${added.name} added (${added.columns.length} ${added.columns.length === 1 ? 'column' : 'columns'})`,
      note:
        kind === 'sql'
          ? 'New tables are additive and cannot break existing queries.'
          : 'New types are additive and cannot break existing code.',
      after: added.name,
    });
  }

  for (const entity of before.entities) {
    const now = afterByName.get(entity.name.toLowerCase());
    if (now) diffEntity(entity, now, kind, changes);
  }

  const counts = { safe: 0, caution: 0, breaking: 0 };
  for (const c of changes) counts[c.severity] += 1;
  return { changes, counts };
}

function entityWord(kind: SourceKind): string {
  return kind === 'sql' ? 'Table' : 'Type';
}

function columnWord(kind: SourceKind): string {
  return kind === 'sql' ? 'Column' : 'Field';
}

/**
 * Fraction of the smaller column set whose names also appear in the other.
 * A single shared column (usually `id`) is not evidence of a rename, so the
 * score is zeroed unless at least two names line up.
 */
function columnOverlap(a: Entity, b: Entity): number {
  if (a.columns.length === 0 || b.columns.length === 0) return 0;
  const bNames = new Set(b.columns.map((c) => c.name.toLowerCase()));
  const shared = a.columns.filter((c) => bNames.has(c.name.toLowerCase())).length;
  if (shared < 2) return 0;
  return shared / Math.min(a.columns.length, b.columns.length);
}

function diffEntity(before: Entity, after: Entity, kind: SourceKind, changes: Change[]): void {
  const entity = after.name;
  const beforeCols = new Map(before.columns.map((c) => [c.name.toLowerCase(), c]));
  const afterCols = new Map(after.columns.map((c) => [c.name.toLowerCase(), c]));

  const removed = before.columns.filter((c) => !afterCols.has(c.name.toLowerCase()));
  const added = after.columns.filter((c) => !beforeCols.has(c.name.toLowerCase()));

  // Rename heuristic: an added and a removed column with the same type family
  // and either the same position or a near-identical name.
  const renamedCols = new Map<Column, Column>();
  for (const gone of removed) {
    let best: Column | null = null;
    for (const cand of added) {
      if ([...renamedCols.values()].includes(cand)) continue;
      if (cand.family !== gone.family) continue;
      const nameClose = nameSimilar(gone.name, cand.name);
      const samePos = cand.position === gone.position;
      if (nameClose || (samePos && sameRawType(gone, cand))) {
        best = cand;
        if (nameClose) break;
      }
    }
    if (best) renamedCols.set(gone, best);
  }

  for (const [gone, now] of renamedCols) {
    changes.push({
      kind: 'column-renamed',
      severity: 'caution',
      entity,
      column: now.name,
      summary: `${columnWord(kind)} ${gone.name} renamed to ${now.name}`,
      note:
        kind === 'sql'
          ? `Use ALTER TABLE ${entity} RENAME COLUMN ${gone.name} TO ${now.name}; a drop-and-add empties the column.`
          : 'Renames are breaking for every reader of the old field name; update call sites together.',
      before: gone.name,
      after: now.name,
    });
    diffColumn(gone, now, entity, kind, changes);
  }

  for (const gone of removed) {
    if (renamedCols.has(gone)) continue;
    changes.push({
      kind: 'column-removed',
      severity: 'breaking',
      entity,
      column: gone.name,
      summary: `${columnWord(kind)} ${gone.name} removed`,
      note:
        kind === 'sql'
          ? 'Dropping a column deletes its data; deploy code that stops reading it before the schema change, not after.'
          : 'Readers of this field break; deploy code that stops reading it before shipping the new type.',
      before: `${gone.name}: ${gone.rawType}`,
    });
  }

  for (const now of added) {
    if ([...renamedCols.values()].includes(now)) continue;
    changes.push(describeAddedColumn(now, entity, kind));
  }

  for (const col of before.columns) {
    const now = afterCols.get(col.name.toLowerCase());
    if (now) diffColumn(col, now, entity, kind, changes);
  }

  diffKeysAndIndexes(before, after, kind, changes);
}

function nameSimilar(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/[_-]/g, '');
  const y = b.toLowerCase().replace(/[_-]/g, '');
  if (x === y) return true;
  if (x.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  return levenshtein(x, y) <= Math.min(2, Math.floor(Math.max(x.length, y.length) / 4));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function describeAddedColumn(col: Column, entity: string, kind: SourceKind): Change {
  const base = {
    kind: 'column-added' as const,
    entity,
    column: col.name,
    summary: `${columnWord(kind)} ${col.name} added (${col.rawType})`,
    after: `${col.name}: ${col.rawType}`,
  };
  if (kind === 'sql') {
    if (!col.nullable && !col.hasDefault) {
      return {
        ...base,
        severity: 'breaking',
        note: 'A NOT NULL column without a DEFAULT fails on any existing row; add a DEFAULT or backfill in a separate step.',
      };
    }
    if (!col.nullable && col.hasDefault) {
      return {
        ...base,
        severity: 'caution',
        note: 'NOT NULL with a DEFAULT applies cleanly, but rewriting a large table can lock it; on older engines add the column nullable, backfill, then add the constraint.',
      };
    }
    return { ...base, severity: 'safe', note: 'A nullable column is additive; existing rows read as NULL.' };
  }
  if (!col.nullable) {
    return {
      ...base,
      severity: 'breaking',
      note: 'A new required field breaks every existing object literal and constructor of this type; make it optional first, then tighten.',
    };
  }
  return { ...base, severity: 'safe', note: 'Optional fields are additive; existing code compiles unchanged.' };
}

function diffColumn(before: Column, after: Column, entity: string, kind: SourceKind, changes: Change[]): void {
  const column = after.name;

  if (!sameRawType(before, after)) {
    const verdict = classifyTypeChange(before, after, kind);
    changes.push({
      kind: 'type-changed',
      severity: verdict.severity,
      entity,
      column,
      summary: `${columnWord(kind)} ${column} type changed: ${before.rawType} -> ${after.rawType}`,
      note: verdict.note,
      before: before.rawType,
      after: after.rawType,
    });
  }

  if (before.nullable !== after.nullable) {
    if (!after.nullable) {
      changes.push({
        kind: 'nullability-changed',
        severity: kind === 'sql' && !after.hasDefault ? 'breaking' : 'caution',
        entity,
        column,
        summary:
          kind === 'sql'
            ? `Column ${column} is now NOT NULL`
            : `Field ${column} is now required`,
        note:
          kind === 'sql'
            ? after.hasDefault
              ? 'Backfill remaining NULLs before applying; the DEFAULT only covers new rows, not existing NULLs.'
              : 'Existing NULLs make this fail; backfill the column (and consider a DEFAULT) before adding the constraint.'
            : 'Every producer of this type must now supply the field; fix construction sites before tightening.',
        before: 'nullable',
        after: kind === 'sql' ? 'NOT NULL' : 'required',
      });
    } else {
      changes.push({
        kind: 'nullability-changed',
        severity: kind === 'sql' ? 'safe' : 'caution',
        entity,
        column,
        summary:
          kind === 'sql' ? `Column ${column} is now nullable` : `Field ${column} is now optional`,
        note:
          kind === 'sql'
            ? 'Dropping NOT NULL always applies cleanly, but code that assumed a value must now handle NULL.'
            : 'Every reader must now handle undefined; this loosening breaks consumers, not producers.',
        before: kind === 'sql' ? 'NOT NULL' : 'required',
        after: kind === 'sql' ? 'nullable' : 'optional',
      });
    }
  }

  if (before.hasDefault !== after.hasDefault || (before.defaultValue ?? '') !== (after.defaultValue ?? '')) {
    if (kind === 'sql') {
      if (!before.hasDefault && after.hasDefault) {
        changes.push({
          kind: 'default-changed',
          severity: 'safe',
          entity,
          column,
          summary: `Column ${column} gained DEFAULT ${after.defaultValue ?? ''}`.trim(),
          note: 'Adding a DEFAULT only affects future inserts; existing rows are untouched.',
          after: after.defaultValue,
        });
      } else if (before.hasDefault && !after.hasDefault) {
        changes.push({
          kind: 'default-changed',
          severity: after.nullable ? 'caution' : 'breaking',
          entity,
          column,
          summary: `Column ${column} lost its DEFAULT`,
          note: after.nullable
            ? 'Inserts that omitted this column now write NULL; check application inserts.'
            : 'Inserts that omitted this column now fail against NOT NULL; update the application first.',
          before: before.defaultValue,
        });
      } else if (before.hasDefault && after.hasDefault) {
        changes.push({
          kind: 'default-changed',
          severity: 'safe',
          entity,
          column,
          summary: `Column ${column} DEFAULT changed: ${before.defaultValue ?? '?'} -> ${after.defaultValue ?? '?'}`,
          note: 'Only future inserts see the new default; audit code that relied on the old value.',
          before: before.defaultValue,
          after: after.defaultValue,
        });
      }
    }
  }

  if (kind === 'typescript' && before.readonly !== after.readonly) {
    changes.push({
      kind: 'readonly-changed',
      severity: after.readonly ? 'caution' : 'safe',
      entity,
      column,
      summary: after.readonly ? `Field ${column} is now readonly` : `Field ${column} is no longer readonly`,
      note: after.readonly
        ? 'Code that assigns to this field stops compiling.'
        : 'Loosening readonly cannot break existing code.',
    });
  }

  if (kind === 'sql' && before.autoIncrement !== after.autoIncrement) {
    changes.push({
      kind: 'auto-increment-changed',
      severity: 'caution',
      entity,
      column,
      summary: after.autoIncrement
        ? `Column ${column} is now auto-generated`
        : `Column ${column} is no longer auto-generated`,
      note: after.autoIncrement
        ? 'Seed the sequence past the current maximum value or new inserts will collide with existing ids.'
        : 'The application must now supply this value on every insert.',
    });
  }
}

function diffKeysAndIndexes(before: Entity, after: Entity, kind: SourceKind, changes: Change[]): void {
  if (kind !== 'sql') return;
  const entity = after.name;

  const pkBefore = before.primaryKey.map((c) => c.toLowerCase()).join(',');
  const pkAfter = after.primaryKey.map((c) => c.toLowerCase()).join(',');
  const inlinePkBefore = before.columns.filter((c) => c.isPrimaryKey).map((c) => c.name.toLowerCase()).join(',');
  const inlinePkAfter = after.columns.filter((c) => c.isPrimaryKey).map((c) => c.name.toLowerCase()).join(',');
  const effectivePkBefore = pkBefore || inlinePkBefore;
  const effectivePkAfter = pkAfter || inlinePkAfter;
  if (effectivePkBefore !== effectivePkAfter && (effectivePkBefore || effectivePkAfter)) {
    changes.push({
      kind: 'primary-key-changed',
      severity: 'breaking',
      entity,
      summary: `Primary key changed: (${effectivePkBefore || 'none'}) -> (${effectivePkAfter || 'none'})`,
      note: 'Changing a primary key rewrites the table and invalidates every foreign key pointing at it; plan this as its own migration window.',
      before: effectivePkBefore || 'none',
      after: effectivePkAfter || 'none',
    });
  }

  const uniqueKey = (cols: string[]): string => cols.map((c) => c.toLowerCase()).sort().join(',');
  const uniquesBefore = new Set([
    ...before.uniques.map(uniqueKey),
    ...before.columns.filter((c) => c.isUnique).map((c) => uniqueKey([c.name])),
    ...before.indexes.filter((i) => i.unique).map((i) => uniqueKey(i.columns)),
  ]);
  const uniquesAfter = new Set([
    ...after.uniques.map(uniqueKey),
    ...after.columns.filter((c) => c.isUnique).map((c) => uniqueKey([c.name])),
    ...after.indexes.filter((i) => i.unique).map((i) => uniqueKey(i.columns)),
  ]);
  for (const u of uniquesAfter) {
    if (!uniquesBefore.has(u)) {
      changes.push({
        kind: 'unique-changed',
        severity: 'caution',
        entity,
        summary: `Unique constraint added on (${u})`,
        note: 'The migration fails if duplicates already exist; check with a GROUP BY ... HAVING COUNT(*) > 1 first.',
        after: u,
      });
    }
  }
  for (const u of uniquesBefore) {
    if (!uniquesAfter.has(u)) {
      changes.push({
        kind: 'unique-changed',
        severity: 'caution',
        entity,
        summary: `Unique constraint removed from (${u})`,
        note: 'Code that relied on this uniqueness invariant (upserts, lookups expecting one row) can now see duplicates.',
        before: u,
      });
    }
  }

  const indexKey = (i: IndexDef): string => i.columns.map((c) => c.toLowerCase()).join(',');
  const idxBefore = new Map(before.indexes.filter((i) => !i.unique).map((i) => [indexKey(i), i]));
  const idxAfter = new Map(after.indexes.filter((i) => !i.unique).map((i) => [indexKey(i), i]));
  for (const [key] of idxAfter) {
    if (!idxBefore.has(key)) {
      changes.push({
        kind: 'index-added',
        severity: 'safe',
        entity,
        summary: `Index added on (${key})`,
        note: 'Adding an index is safe for correctness; build it CONCURRENTLY on a large, busy table.',
        after: key,
      });
    }
  }
  for (const [key] of idxBefore) {
    if (!idxAfter.has(key)) {
      changes.push({
        kind: 'index-removed',
        severity: 'caution',
        entity,
        summary: `Index removed from (${key})`,
        note: 'Queries that used this index fall back to scans; check the query planner before and after.',
        before: key,
      });
    }
  }

  const fkKey = (cols: string[], ref: string): string => `${cols.map((c) => c.toLowerCase()).join(',')} -> ${ref.toLowerCase()}`;
  const fksBefore = new Set(before.foreignKeys.map((f) => fkKey(f.columns, f.refEntity)));
  const fksAfter = new Set(after.foreignKeys.map((f) => fkKey(f.columns, f.refEntity)));
  for (const col of before.columns) {
    if (col.references) fksBefore.add(fkKey([col.name], col.references.entity));
  }
  for (const col of after.columns) {
    if (col.references) fksAfter.add(fkKey([col.name], col.references.entity));
  }
  for (const f of fksAfter) {
    if (!fksBefore.has(f)) {
      changes.push({
        kind: 'foreign-key-added',
        severity: 'caution',
        entity,
        summary: `Foreign key added: ${f}`,
        note: 'Validation fails if orphaned rows exist; clean them up first (or add the constraint NOT VALID, then VALIDATE).',
        after: f,
      });
    }
  }
  for (const f of fksBefore) {
    if (!fksAfter.has(f)) {
      changes.push({
        kind: 'foreign-key-removed',
        severity: 'caution',
        entity,
        summary: `Foreign key removed: ${f}`,
        note: 'Referential integrity is no longer enforced by the database; the application must guarantee it now.',
        before: f,
      });
    }
  }
}
