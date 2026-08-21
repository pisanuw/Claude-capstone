/**
 * Deterministic plain-English narration for each replay stage. This replaces
 * the idea's suggested Claude API narrator: the sentences are generated from
 * the actual execution stats, so they are free, offline, and always accurate.
 * Each sentence describes only its own stage and never spoils the next one.
 */

function rows(n: number): string {
  return `${n} row${n === 1 ? '' : 's'}`;
}

function groupsWord(n: number): string {
  return `${n} group${n === 1 ? '' : 's'}`;
}

export function from(table: string, rowCount: number, colCount: number): string {
  return `Execution starts by reading table ${table}: all ${rows(rowCount)} ${rowCount === 1 ? 'is' : 'are'} laid on the table, ` +
    `each with ${colCount} column${colCount === 1 ? '' : 's'}. Nothing is filtered yet.`;
}

export function join(
  kind: 'inner' | 'left',
  table: string,
  leftCount: number,
  rightCount: number,
  matchedPairs: number,
  unmatchedLeft: number,
): string {
  const base = `Each of the ${rows(leftCount)} on the left is compared with each of the ` +
    `${rows(rightCount)} in ${table}; ${matchedPairs === 1 ? '1 pair satisfies' : `${matchedPairs} pairs satisfy`} the ON condition and merge into wider rows.`;
  if (kind === 'left') {
    if (unmatchedLeft === 0) {
      return `${base} Every left row found at least one partner, so this LEFT JOIN behaves like an inner join here.`;
    }
    return `${base} Because this is a LEFT JOIN, the ${rows(unmatchedLeft)} with no partner ` +
      `${unmatchedLeft === 1 ? 'is' : 'are'} kept anyway, with NULL filling the ${table} columns.`;
  }
  if (unmatchedLeft > 0) {
    return `${base} The ${rows(unmatchedLeft)} with no partner ${unmatchedLeft === 1 ? 'is' : 'are'} discarded: an inner join keeps only matches.`;
  }
  return `${base} Every left row found at least one partner, so nothing is discarded.`;
}

export function where(condition: string, inCount: number, kept: number, dropped: number): string {
  if (dropped === 0) {
    return `The condition ${condition} is checked against each of the ${rows(inCount)}; every one of them passes.`;
  }
  if (kept === 0) {
    return `The condition ${condition} is checked against each of the ${rows(inCount)}; none of them passes, so the result is already empty.`;
  }
  return `The condition ${condition} is checked against each of the ${rows(inCount)}: ` +
    `${rows(kept)} ${kept === 1 ? 'passes' : 'pass'}, while ${rows(dropped)} ` +
    `${dropped === 1 ? 'fails and is' : 'fail and are'} removed. A NULL condition counts as failing.`;
}

export function group(inCount: number, groupCount: number, keys: string[]): string {
  if (keys.length === 0) {
    return `The aggregate functions need a group to work on, and with no GROUP BY the whole set of ` +
      `${rows(inCount)} collapses into one implicit group.`;
  }
  return `The ${rows(inCount)} are sorted into buckets by ${keys.join(', ')}: rows sharing the same ` +
    `value${keys.length > 1 ? 's' : ''} land in the same bucket, producing ${groupsWord(groupCount)}. ` +
    `From here on, whole groups (not individual rows) move through the query.`;
}

export function having(condition: string, inCount: number, kept: number): string {
  const dropped = inCount - kept;
  if (dropped === 0) {
    return `HAVING filters whole groups the way WHERE filters rows: ${condition} is checked per group, and all ${groupsWord(inCount)} pass.`;
  }
  return `HAVING filters whole groups the way WHERE filters rows: ${condition} is evaluated once per group, ` +
    `keeping ${groupsWord(kept)} and discarding ${groupsWord(dropped)} (every row inside a discarded group vanishes with it).`;
}

export function select(columns: string[], outCount: number): string {
  const cols = columns.length;
  return `Only now does the SELECT list run: each of the ${rows(outCount)} is narrowed to the ` +
    `${cols} requested column${cols === 1 ? '' : 's'} (${columns.join(', ')}), computing any expressions and aggregates.`;
}

export function distinct(inCount: number, kept: number): string {
  const dropped = inCount - kept;
  if (dropped === 0) {
    return `DISTINCT scans the ${rows(inCount)} for duplicates and finds none; every row was already unique.`;
  }
  return `DISTINCT keeps the first copy of each identical row: ${dropped} ` +
    `${dropped === 1 ? 'duplicate is' : 'duplicates are'} removed, leaving ${rows(kept)}.`;
}

export function order(keys: string[], count: number): string {
  return `The ${rows(count)} are rearranged by ${keys.join(', then by ')}. ` +
    `Until this point, row order was an accident of storage; ORDER BY is what makes it a promise. NULLs sort last.`;
}

export function limit(inCount: number, kept: number, count: number, offset: number): string {
  const skipped = Math.min(offset, inCount);
  if (offset > 0) {
    return `Finally the window is cut: OFFSET skips the first ${rows(skipped)}, then LIMIT takes up to ` +
      `${count} of what remains, so ${rows(kept)} of the ${inCount} survive.`;
  }
  if (kept === inCount) {
    return `LIMIT ${count} would cut the result down, but only ${rows(inCount)} reached this stage, so nothing is trimmed.`;
  }
  return `Finally LIMIT keeps just the first ${rows(kept)} of ${inCount}; everything after the cutoff is thrown away.`;
}

export function result(count: number, cols: number): string {
  if (count === 0) {
    return `The finished result is empty: 0 rows made it through every stage. Step back through the replay to see where they were eliminated.`;
  }
  return `This is the finished result the database would hand back: ${rows(count)}, ` +
    `${cols} column${cols === 1 ? '' : 's'}, in their final order.`;
}
