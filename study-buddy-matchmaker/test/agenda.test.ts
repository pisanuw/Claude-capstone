import { describe, expect, it } from 'vitest';
import { agendaFor, cardsFor } from '../src/core/agenda';
import { parseCsv } from '../src/core/csv';
import { cardMarkdown, groupsMarkdown, pairingsCsv } from '../src/core/export';
import { DEFAULT_THRESHOLDS, gradebookFromCsv, profiles, topicsOf } from '../src/core/gradebook';
import { describeGroup, makeGroups } from '../src/core/match';
import { parseCustomResources, resourcesFor } from '../src/core/resources';
import { sampleCsv } from '../src/core/sample';

const th = DEFAULT_THRESHOLDS;
const opts = { thresholds: th };

const csv = `id,name,R [recursion] /10,G [graphs] /10,S [sorting] /10,H [hashing] /10
a,Ann,10,3,9,2
b,Bo,2,10,3,1
c,Cy,9,9,2,3`;

describe('agenda', () => {
  const { book } = gradebookFromCsv(csv);
  const ps = profiles(book);
  const topics = topicsOf(book);

  it('picks the strongest leader per topic and alternates leaders', () => {
    const g = describeGroup(ps, [0, 1, 2], topics, opts);
    const a = agendaFor(ps, g, topics, th);
    expect(a.sessions.map((s) => [s.topic, s.leader, s.learners])).toEqual([
      ['sorting', 0, [1, 2]],
      ['graphs', 1, [0]],
      ['recursion', 0, [1]],
    ]);
    expect(a.officeHours.map((o) => o.topic)).toEqual(['hashing']);
    expect(a.officeHours[0]?.resources[0]?.url).toBe('https://en.wikipedia.org/wiki/Hash_table');
    expect(agendaFor(ps, g, topics, th, [], 1).sessions).toHaveLength(1);
  });

  it('cards show only the student\'s own levels and gaps', () => {
    const g = describeGroup(ps, [0, 1], topics, opts);
    const a = agendaFor(ps, g, topics, th);
    const [ann, bo] = cardsFor(ps, g, a, topics, th);
    expect(ann?.groupmates).toEqual([1]);
    expect(ann?.leads).toEqual([
      { topic: 'recursion', with: [1] },
      { topic: 'sorting', with: [1] },
    ]);
    expect(ann?.learns).toEqual([{ topic: 'graphs', from: 1 }]);
    expect(ann?.ownGaps.map((x) => x.topic)).toEqual(['hashing']);
    expect(bo?.levels.map((l) => l.level)).toEqual(['gap', 'strong', 'gap', 'gap']);
    const md = cardMarkdown(ps, ann!, 1);
    expect(md).toMatch(/^# Ann: study group 1/);
    expect(md).toContain('You are meeting Bo.');
    expect(md).toContain('- graphs, led by Bo');
    expect(md).toContain('- hashing: needs work');
    // Nothing about Bo's own levels.
    expect(md).not.toMatch(/Bo[^\n]*(needs work|strong|getting there)/);
  });

  it('exports pairings and agendas', () => {
    const { groups } = makeGroups(ps, topics, opts);
    const agendas = groups.map((g) => agendaFor(ps, g, topics, th));
    const rows = parseCsv(pairingsCsv(ps, groups, agendas));
    expect(rows[0]).toEqual(['group', 'student id', 'name', 'groupmates', 'leads', 'learns', 'group score']);
    expect(rows).toHaveLength(4);
    const md = groupsMarkdown(ps, groups, agendas);
    expect(md).toMatch(/^# Study groups/);
    expect(md).toContain('## Group 1: Ann, Bo and Cy');
    expect(md).toContain('Bring to office hours: hashing.');
  });

  it('says so when a group has nothing to teach each other', () => {
    const flat = gradebookFromCsv('n,Q [x] /1\nA,0.5\nB,0.5');
    const p2 = profiles(flat.book);
    const g = describeGroup(p2, [0, 1], ['x'], opts);
    const a = agendaFor(p2, g, ['x'], th);
    expect(a.sessions).toEqual([]);
    expect(groupsMarkdown(p2, [g], [a])).toContain('No topic where one member can help another');
    const c = cardsFor(p2, g, a, ['x'], th)[0]!;
    expect(cardMarkdown(p2, c, 1)).toContain('**Also worth your time on your own:**');
  });

  it('the sample class gives every student a card', () => {
    const { book: b } = gradebookFromCsv(sampleCsv());
    const p = profiles(b);
    const t = topicsOf(b);
    const { groups } = makeGroups(p, t, opts);
    const cards = groups.flatMap((g) => cardsFor(p, g, agendaFor(p, g, t, th), t, th));
    expect(cards.map((c) => c.student).sort((x, y) => x - y)).toEqual([...Array(23).keys()]);
    expect(sampleCsv(1)).not.toBe(sampleCsv());
  });
});

describe('resources', () => {
  it('matches built-in resources by keyword and puts the instructor\'s first', () => {
    expect(resourcesFor('Recursion basics')[0]?.title).toMatch(/Recursion/);
    expect(resourcesFor('graph search').map((r) => r.url)).toEqual(['https://en.wikipedia.org/wiki/Graph_traversal', 'https://visualgo.net/en/dfsbfs']);
    expect(resourcesFor('underwater basket weaving')).toEqual([]);
    const { resources, bad } = parseCustomResources('# comment\nRecursion | Lecture 7 | https://example.edu/l7\nbroken line\nx | y | ftp://nope\n\n');
    expect(bad).toEqual(['broken line', 'x | y | ftp://nope']);
    expect(resourcesFor('recursion', resources).map((r) => r.title)).toEqual(['Lecture 7', 'Recursion (Wikipedia)', 'Recursion tree visualiser (VisuAlgo)']);
  });
});
