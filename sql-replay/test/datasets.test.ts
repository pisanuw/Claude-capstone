import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv';
import { DEMO_QUERIES, DEMO_TABLES } from '../src/core/datasets';
import { execute } from '../src/core/execute';
import { parse } from '../src/core/parse';

describe('built-in demos', () => {
  const tables = DEMO_TABLES.map((t) => parseCsv(t.name, t.csv));

  it('demo tables parse and stay screen-sized', () => {
    for (const t of tables) {
      expect(t.rows.length).toBeGreaterThan(0);
      expect(t.rows.length).toBeLessThanOrEqual(12);
    }
  });

  it.each(DEMO_QUERIES.map((q) => [q.title, q.sql] as const))(
    '%s replays end to end with a non-empty result',
    (_title, sql) => {
      const steps = execute(parse(sql), tables);
      const last = steps[steps.length - 1];
      expect(last.kind).toBe('result');
      expect(last.grids[0].rows.length).toBeGreaterThan(0);
      for (const s of steps) expect(s.narration.length).toBeGreaterThan(10);
    },
  );

  it('the LEFT JOIN demo actually produces a padded row', () => {
    const demo = DEMO_QUERIES.find((q) => q.title.includes('LEFT'))!;
    const steps = execute(parse(demo.sql), tables);
    const join = steps.find((s) => s.kind === 'join')!;
    expect(join.grids[1].rows.some((r) => r.status === 'padded')).toBe(true);
  });

  it('the aggregate demo drops at least one group in HAVING', () => {
    const demo = DEMO_QUERIES.find((q) => q.title.includes('Group'))!;
    const steps = execute(parse(demo.sql), tables);
    const having = steps.find((s) => s.kind === 'having')!;
    expect(having.grids[0].rows.some((r) => r.status === 'dropped')).toBe(true);
  });
});
