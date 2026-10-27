// A made-up class of 23 students for trying the tool. Each student has a
// hidden skill per topic drawn from a seeded RNG, with a few archetypes
// (strong on recursion but weak on graphs, and so on) so complementary pairs
// exist. Some cells are blank, as in real gradebooks.

import { toCsv } from './csv';

const NAMES = [
  'Avery Chen', 'Bilal Haddad', 'Camila Reyes', 'Dmitri Volkov', 'Esi Mensah', 'Farah Siddiqui', 'Gus Lindqvist',
  'Hana Kobayashi', 'Ibrahim Diallo', 'Jade Nguyen', 'Kofi Asante', 'Lena Novak', 'Mateo Rossi', 'Nia Okafor',
  'Omar Farouk', 'Priya Raman', 'Quinn Murphy', 'Rosa Alvarez', 'Sven Berg', 'Tara Singh', 'Uma Patel',
  'Viktor Hale', 'Wren Oduya',
];

export const SAMPLE_TOPICS = ['recursion', 'graphs', 'sorting', 'big-o', 'linked lists', 'hash tables'];

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

/** Items: two quiz questions and one homework problem per topic. */
const ITEMS = SAMPLE_TOPICS.flatMap((t, k) => [
  { header: `Quiz ${k + 1}a [${t}] /5`, max: 5 },
  { header: `Quiz ${k + 1}b [${t}] /5`, max: 5 },
  { header: `HW${k + 1} [${t}] /10`, max: 10 },
]);

export function sampleCsv(seed = 2026): string {
  const r = rng(seed);
  const rows: (string | number)[][] = [['Student ID', 'Name', ...ITEMS.map((i) => i.header)]];
  NAMES.forEach((name, s) => {
    // Archetype: one or two topics this student is good at, one or two they struggle with.
    const skill = SAMPLE_TOPICS.map(() => 0.55 + r() * 0.3);
    const good = Math.floor(r() * SAMPLE_TOPICS.length);
    const bad = (good + 1 + Math.floor(r() * (SAMPLE_TOPICS.length - 1))) % SAMPLE_TOPICS.length;
    skill[good] = 0.88 + r() * 0.12;
    skill[bad] = 0.25 + r() * 0.25;
    if (r() < 0.4) skill[(bad + 2) % SAMPLE_TOPICS.length] = 0.85 + r() * 0.15;
    const cells = ITEMS.map((it, k) => {
      if (r() < 0.04) return '';
      const p = Math.max(0, Math.min(1, (skill[Math.floor(k / 3)] as number) + (r() - 0.5) * 0.2));
      return Math.round(p * it.max * 2) / 2;
    });
    rows.push([`s${String(s + 1).padStart(3, '0')}`, name, ...cells]);
  });
  return toCsv(rows);
}
