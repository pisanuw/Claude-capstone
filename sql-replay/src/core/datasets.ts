/** Built-in demonstration data and example queries. */

export interface DemoQuery {
  title: string;
  sql: string;
  blurb: string;
}

/** Sample tables, kept small enough that every row stays visible on screen. */
export const DEMO_TABLES: { name: string; csv: string }[] = [
  {
    name: 'customers',
    csv: `id,name,city,signup_year
1,Ada,Seattle,2023
2,Grace,Portland,2024
3,Alan,Seattle,2025
4,Edsger,Austin,2024
5,Barbara,Portland,2026
6,Donald,Bellevue,2025`,
  },
  {
    name: 'orders',
    csv: `id,customer_id,product,amount
101,1,keyboard,80
102,1,monitor,240
103,2,laptop,1200
104,3,mouse,25
105,3,desk,300
106,3,lamp,45
107,4,chair,150
108,2,dock,90
109,7,cable,15
110,1,webcam,60`,
  },
];

export const DEMO_QUERIES: DemoQuery[] = [
  {
    title: 'Filter and sort',
    blurb: 'WHERE drops rows, ORDER BY makes the order a promise',
    sql: `SELECT name, city, signup_year
FROM customers
WHERE signup_year >= 2024
ORDER BY signup_year DESC, name`,
  },
  {
    title: 'Inner join',
    blurb: 'rows pair up at the join, non-matches vanish',
    sql: `SELECT c.name, o.product, o.amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.amount > 50
ORDER BY o.amount DESC`,
  },
  {
    title: 'LEFT JOIN with NULLs',
    blurb: 'customers with no orders survive, padded with NULL',
    sql: `SELECT c.name, o.product, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
ORDER BY c.name`,
  },
  {
    title: 'Group and aggregate',
    blurb: 'rows collapse into groups, HAVING filters the groups',
    sql: `SELECT c.city, COUNT(*) AS orders, SUM(o.amount) AS total
FROM orders o
JOIN customers c ON o.customer_id = c.id
GROUP BY c.city
HAVING SUM(o.amount) > 200
ORDER BY total DESC`,
  },
  {
    title: 'DISTINCT and LIMIT',
    blurb: 'duplicates removed, then the result is trimmed',
    sql: `SELECT DISTINCT city
FROM customers
ORDER BY city
LIMIT 3`,
  },
];
