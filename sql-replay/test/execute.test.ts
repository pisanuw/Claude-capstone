import { describe, expect, it } from 'vitest';
import { execute } from '../src/core/execute';
import { parse } from '../src/core/parse';
import type { Step, Table, Value } from '../src/core/types';

const customers: Table = {
  name: 'customers',
  columns: ['id', 'name', 'city'],
  rows: [
    [1, 'Ada', 'Seattle'],
    [2, 'Grace', 'Portland'],
    [3, 'Alan', 'Seattle'],
    [4, 'Edsger', 'Austin'],
  ],
};

const orders: Table = {
  name: 'orders',
  columns: ['id', 'customer_id', 'amount'],
  rows: [
    [101, 1, 80],
    [102, 1, 240],
    [103, 2, 1200],
    [104, 3, 25],
    [105, 9, 15],
  ],
};

function run(sql: string, tables: Table[] = [customers, orders]): Step[] {
  return execute(parse(sql), tables);
}

function final(steps: Step[]): { columns: string[]; rows: Value[][] } {
  const last = steps[steps.length - 1];
  expect(last.kind).toBe('result');
  return { columns: last.grids[0].columns, rows: last.grids[0].rows.map((r) => r.cells) };
}

function step(steps: Step[], kind: string): Step {
  const s = steps.find((x) => x.kind === kind);
  expect(s, `expected a ${kind} step`).toBeTruthy();
  return s!;
}

describe('execute: single table', () => {
  it('replays FROM → SELECT → RESULT for a bare query', () => {
    const steps = run('SELECT * FROM customers');
    expect(steps.map((s) => s.kind)).toEqual(['from', 'select', 'result']);
    const r = final(steps);
    expect(r.columns).toEqual(['id', 'name', 'city']);
    expect(r.rows).toHaveLength(4);
  });

  it('filters with WHERE and reports kept/dropped per row', () => {
    const steps = run("SELECT name FROM customers WHERE city = 'Seattle'");
    const w = step(steps, 'where');
    const statuses = w.grids[0].rows.map((r) => r.status);
    expect(statuses).toEqual(['kept', 'dropped', 'kept', 'dropped']);
    expect(w.grids[0].rows[0].note).toContain('→ true');
    expect(final(steps).rows).toEqual([['Ada'], ['Alan']]);
  });

  it('projects expressions with aliases', () => {
    const steps = run('SELECT name, id * 10 AS tenfold FROM customers WHERE id <= 2');
    const r = final(steps);
    expect(r.columns).toEqual(['name', 'tenfold']);
    expect(r.rows).toEqual([['Ada', 10], ['Grace', 20]]);
  });

  it('orders ascending, descending, and puts NULLs last', () => {
    const t: Table = { name: 't', columns: ['x'], rows: [[2], [null], [1], [3]] };
    const asc = final(run('SELECT x FROM t ORDER BY x', [t]));
    expect(asc.rows).toEqual([[1], [2], [3], [null]]);
    const desc = final(run('SELECT x FROM t ORDER BY x DESC', [t]));
    expect(desc.rows).toEqual([[3], [2], [1], [null]]);
  });

  it('breaks ties with secondary sort keys', () => {
    const r = final(run('SELECT name, city FROM customers ORDER BY city, name'));
    expect(r.rows).toEqual([
      ['Edsger', 'Austin'],
      ['Grace', 'Portland'],
      ['Ada', 'Seattle'],
      ['Alan', 'Seattle'],
    ]);
  });

  it('sorts by select alias', () => {
    const r = final(run('SELECT name, id * -1 AS neg FROM customers ORDER BY neg'));
    expect(r.rows[0]).toEqual(['Edsger', -4]);
  });

  it('applies LIMIT and OFFSET as a window', () => {
    const steps = run('SELECT id FROM orders ORDER BY id LIMIT 2 OFFSET 1');
    const l = step(steps, 'limit');
    expect(l.grids[0].rows.map((r) => r.status)).toEqual(['dropped', 'kept', 'kept', 'dropped', 'dropped']);
    expect(final(steps).rows).toEqual([[102], [103]]);
  });

  it('removes duplicates with DISTINCT', () => {
    const steps = run('SELECT DISTINCT city FROM customers');
    const d = step(steps, 'distinct');
    expect(d.grids[0].rows.filter((r) => r.status === 'dropped')).toHaveLength(1);
    expect(final(steps).rows).toHaveLength(3);
  });
});

describe('execute: joins', () => {
  it('inner join keeps only matching pairs', () => {
    const steps = run('SELECT c.name, o.amount FROM orders o JOIN customers c ON o.customer_id = c.id');
    const j = step(steps, 'join');
    expect(j.narration).toContain('4 pairs satisfy');
    expect(j.narration).toContain('discarded');
    const r = final(steps);
    expect(r.rows).toHaveLength(4);
    expect(r.columns).toEqual(['name', 'amount']);
  });

  it('left join pads non-matching left rows with NULL', () => {
    const steps = run('SELECT c.name, o.amount FROM customers c LEFT JOIN orders o ON o.customer_id = c.id');
    const j = step(steps, 'join');
    const padded = j.grids[1].rows.filter((r) => r.status === 'padded');
    expect(padded).toHaveLength(1); // Edsger has no orders
    expect(j.narration).toContain('LEFT JOIN');
    const r = final(steps);
    expect(r.rows).toContainEqual(['Edsger', null]);
    expect(r.rows).toHaveLength(5);
  });

  it('qualifies * output columns when tables are joined', () => {
    const r = final(run('SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id LIMIT 1'));
    expect(r.columns).toEqual(['o.id', 'o.customer_id', 'o.amount', 'c.id', 'c.name', 'c.city']);
  });

  it('expands t.* to just that table', () => {
    const r = final(run('SELECT c.* FROM orders o JOIN customers c ON o.customer_id = c.id LIMIT 1'));
    expect(r.columns).toEqual(['c.id', 'c.name', 'c.city']);
  });

  it('left join that matches everything says so', () => {
    const t1: Table = { name: 'a', columns: ['x'], rows: [[1]] };
    const t2: Table = { name: 'b', columns: ['x'], rows: [[1]] };
    const steps = run('SELECT a.x FROM a LEFT JOIN b ON a.x = b.x', [t1, t2]);
    expect(step(steps, 'join').narration).toContain('behaves like an inner join');
  });
});

describe('execute: grouping', () => {
  it('groups, aggregates, and filters groups with HAVING', () => {
    const steps = run(`SELECT c.city, COUNT(*) AS n, SUM(o.amount) AS total
      FROM orders o JOIN customers c ON o.customer_id = c.id
      GROUP BY c.city HAVING SUM(o.amount) > 100 ORDER BY total DESC`);
    const g = step(steps, 'group');
    expect(g.grids[0].rows).toHaveLength(2); // Seattle, Portland
    const h = step(steps, 'having');
    expect(h.grids[0].rows.map((r) => r.status)).toEqual(['kept', 'kept']);
    const r = final(steps);
    expect(r.columns).toEqual(['city', 'n', 'total']);
    expect(r.rows).toEqual([
      ['Portland', 1, 1200],
      ['Seattle', 3, 345],
    ]);
  });

  it('drops groups that fail HAVING', () => {
    const steps = run(`SELECT city, COUNT(*) AS n FROM customers GROUP BY city HAVING COUNT(*) > 1`);
    const h = step(steps, 'having');
    expect(h.grids[0].rows.filter((r) => r.status === 'dropped')).toHaveLength(2);
    expect(final(steps).rows).toEqual([['Seattle', 2]]);
  });

  it('supports aggregates without GROUP BY via one implicit group', () => {
    const steps = run('SELECT COUNT(*) AS n, AVG(amount) AS avg_amt FROM orders');
    const g = step(steps, 'group');
    expect(g.narration).toContain('implicit group');
    expect(final(steps).rows).toEqual([[5, 312]]);
  });

  it('COUNT(col) ignores NULLs while COUNT(*) counts rows', () => {
    const t: Table = { name: 't', columns: ['x'], rows: [[1], [null], [2]] };
    const r = final(run('SELECT COUNT(*) AS all_rows, COUNT(x) AS non_null FROM t', [t]));
    expect(r.rows).toEqual([[3, 2]]);
  });

  it('MIN/MAX over an empty group set yields no rows, not a crash', () => {
    const t: Table = { name: 't', columns: ['x', 'g'], rows: [] };
    const r = final(run('SELECT g, MIN(x) AS lo FROM t GROUP BY g', [t]));
    expect(r.rows).toEqual([]);
  });

  it('orders grouped output by aggregate expressions', () => {
    const r = final(run(`SELECT city, COUNT(*) AS n FROM customers GROUP BY city ORDER BY COUNT(*) DESC, city`));
    expect(r.rows).toEqual([['Seattle', 2], ['Austin', 1], ['Portland', 1]]);
  });
});

describe('execute: errors', () => {
  it('reports unknown tables with available names', () => {
    expect(() => run('SELECT * FROM nope')).toThrow(/Unknown table "nope".*customers/);
  });

  it('reports unknown and ambiguous columns', () => {
    expect(() => run('SELECT wat FROM customers')).toThrow(/Unknown column "wat"/);
    expect(() => run('SELECT id FROM orders o JOIN customers c ON o.customer_id = c.id')).toThrow(/ambiguous/);
  });

  it('rejects duplicate aliases', () => {
    expect(() => run('SELECT * FROM orders c JOIN customers c ON c.id = c.id')).toThrow(/Duplicate table alias/);
  });

  it('rejects aggregates in WHERE', () => {
    expect(() => run('SELECT id FROM orders WHERE COUNT(*) > 1')).toThrow(/not allowed in WHERE/);
  });

  it('rejects HAVING without grouping', () => {
    expect(() => run('SELECT id FROM orders HAVING id > 1')).toThrow(/HAVING needs GROUP BY/);
  });

  it('rejects SELECT * with GROUP BY', () => {
    expect(() => run('SELECT * FROM customers GROUP BY city')).toThrow(/SELECT \*/);
  });

  it('rejects ungrouped columns in a grouped SELECT', () => {
    expect(() => run('SELECT name, COUNT(*) FROM customers GROUP BY city')).toThrow(/not in GROUP BY/);
  });

  it('rejects unknown alias in t.*', () => {
    expect(() => run('SELECT z.* FROM customers')).toThrow(/Unknown table alias "z"/);
  });

  it('rejects unresolvable ORDER BY columns', () => {
    expect(() => run('SELECT name FROM customers ORDER BY wat')).toThrow(/Unknown column|cannot resolve/);
  });
});

describe('execute: trace shape', () => {
  it('every step carries a clause, narration, and at least one grid', () => {
    const steps = run(`SELECT DISTINCT c.city FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.amount > 20 ORDER BY c.city LIMIT 2`);
    expect(steps.map((s) => s.kind)).toEqual([
      'from', 'join', 'where', 'select', 'distinct', 'order', 'limit', 'result',
    ]);
    for (const s of steps) {
      expect(s.clause.length).toBeGreaterThan(0);
      expect(s.narration.length).toBeGreaterThan(10);
      expect(s.grids.length).toBeGreaterThan(0);
      for (const g of s.grids) {
        for (const row of g.rows) expect(row.cells).toHaveLength(g.columns.length);
      }
    }
  });

  it('narrates an empty result with a hint to step back', () => {
    const steps = run('SELECT name FROM customers WHERE id > 100');
    expect(step(steps, 'result').narration).toContain('empty');
  });
});
