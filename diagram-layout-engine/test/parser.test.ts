import { describe, expect, it } from 'vitest';
import { ParseError, decodeLabel, parse, parseStyleList, tryParse } from '../src/core/parser';

const edges = (src: string) => parse(src).edges.map((e) => `${e.from}>${e.to}`);

describe('header', () => {
  it('accepts flowchart and graph with every direction', () => {
    expect(parse('flowchart TD\nA').direction).toBe('TB');
    expect(parse('graph LR\nA').direction).toBe('LR');
    expect(parse('flowchart RL').direction).toBe('RL');
    expect(parse('flowchart BT;A-->B').direction).toBe('BT');
    expect(parse('graph\nA').direction).toBe('TB');
  });

  it('reports a missing or unknown header with a position', () => {
    const r = tryParse('A --> B');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.detail).toMatch(/Unknown diagram type 'A'/);
      expect(r.error.line).toBe(1);
      expect(r.error.col).toBe(1);
    }
    expect(() => parse('')).toThrow(/Missing header/);
    expect(() => parse('sequenceDiagram')).toThrow(/only 'flowchart' and 'graph'/);
    expect(() => parse('flowchart XY')).toThrow(/Unknown direction 'XY'/);
  });

  it('skips comments and blank lines', () => {
    const c = parse('%% top comment\n\nflowchart LR %% trailing\n  A --> B %% edge\n');
    expect(edges('%% c\nflowchart LR\nA-->B%%x')).toEqual(['A>B']);
    expect(c.nodes.size).toBe(2);
  });
});

describe('nodes', () => {
  it('parses every shape', () => {
    const c = parse(`flowchart TD
a[r]
b(round)
c([stadium])
d[[sub]]
e[(db)]
f((circle))
g(((double)))
h>flag]
i{diamond}
j{{hex}}
k[/para/]
l[\\alt\\]
m[/trap\\]
n[\\trapalt/]`);
    expect([...c.nodes.values()].map((n) => n.shape)).toEqual([
      'rect',
      'round',
      'stadium',
      'subroutine',
      'cylinder',
      'circle',
      'doublecircle',
      'asymmetric',
      'diamond',
      'hexagon',
      'parallelogram',
      'parallelogram-alt',
      'trapezoid',
      'trapezoid-alt',
    ]);
    expect(c.nodes.get('f')!.label).toBe('circle');
  });

  it('handles quoted labels, entities and line breaks', () => {
    const c = parse('flowchart TD\nA["Hello (world) [x]"] --> B["say \\"hi\\""]\nC[one<br>two<br/>three]\nD[#quot;q#quot; #amp; #lt;tag#gt;]');
    expect(c.nodes.get('A')!.label).toBe('Hello (world) [x]');
    expect(c.nodes.get('B')!.label).toBe('say "hi"');
    expect(c.nodes.get('C')!.label).toBe('one\ntwo\nthree');
    expect(c.nodes.get('D')!.label).toBe('"q" & <tag>');
  });

  it('uses the id as label and keeps an explicit label on later bare references', () => {
    const c = parse('flowchart TD\nA[Alpha] --> B\nB --> A');
    expect(c.nodes.get('A')!.label).toBe('Alpha');
    expect(c.nodes.get('B')!.label).toBe('B');
  });

  it('warns when a node is redefined', () => {
    const c = parse('flowchart TD\nA[One]\nA[Two]');
    expect(c.nodes.get('A')!.label).toBe('Two');
    expect(c.warnings[0].message).toMatch(/redefined/);
  });

  it('supports unicode ids', () => {
    expect(edges('flowchart LR\nÄpfel --> 東京')).toEqual(['Äpfel>東京']);
  });

  it('rejects unclosed shapes and reserved end', () => {
    expect(() => parse('flowchart TD\nA[oops --> B')).toThrow(/Unclosed '\[' for node 'A'/);
    expect(() => parse('flowchart TD\nA["oops]')).toThrow(/Unclosed string/);
    expect(() => parse('flowchart TD\nA["x" --> B')).toThrow(/Expected '\]'/);
    expect(() => parse('flowchart TD\nA --> end')).toThrow(/'end' is reserved/);
  });
});

describe('edges', () => {
  it('parses link styles, heads and lengths', () => {
    const c = parse(`flowchart LR
A --> B
B --- C
C -.-> D
D ==> E
E --o F
F --x G
G <--> H
H ---> I
I ~~~ J
J -..-> K
K ==== L
L o--o M
M x--x N`);
    const got = c.edges.map((e) => [e.line, e.tail, e.head, e.minlen].join(','));
    expect(got).toEqual([
      'solid,none,arrow,1',
      'solid,none,none,1',
      'dotted,none,arrow,1',
      'thick,none,arrow,1',
      'solid,none,circle,1',
      'solid,none,cross,1',
      'solid,arrow,arrow,1',
      'solid,none,arrow,2',
      'invisible,none,none,1',
      'dotted,none,arrow,2',
      'thick,none,none,2',
      'solid,circle,circle,1',
      'solid,cross,cross,1',
    ]);
  });

  it('parses both edge label forms', () => {
    const c = parse(`flowchart TD
A -->|yes| B
A -- no way --> C
A == big ==> D
A -. maybe .-> E
A -->|"quoted | pipe"| F
A ---|open| G`);
    expect(c.edges.map((e) => e.label)).toEqual(['yes', 'no way', 'big', 'maybe', 'quoted | pipe', 'open']);
  });

  it('expands chains and & groups', () => {
    expect(edges('flowchart TD\nA --> B --> C')).toEqual(['A>B', 'B>C']);
    expect(edges('flowchart TD\nA & B --> C & D')).toEqual(['A>C', 'A>D', 'B>C', 'B>D']);
    expect(edges('flowchart TD\nA-->B;B-->C')).toEqual(['A>B', 'B>C']);
  });

  it('gives clear errors for broken links', () => {
    expect(() => parse('flowchart TD\nA -->')).toThrow(/Expected a node id after the link/);
    expect(() => parse('flowchart TD\nA -- text without end')).toThrow(/Unclosed link label/);
    expect(() => parse('flowchart TD\nA -. text without end')).toThrow(/Unclosed dotted link label/);
    expect(() => parse('flowchart TD\nA -->|label B')).toThrow(/Unclosed edge label/);
    expect(() => parse('flowchart TD\nA -> B')).toThrow(/Malformed link '->'/);
    expect(() => parse('flowchart TD\nA B')).toThrow(/Unexpected 'B' after node 'A'/);
    expect(() => parse('flowchart TD\nA --> |x|')).toThrow(/Expected a node id/);
  });

  it('reports line and column of the error', () => {
    const r = tryParse('flowchart TD\n  A --> B\n  B --> C[oops');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ParseError);
      expect(r.error.line).toBe(3);
      expect(r.error.col).toBe(10);
      expect(r.error.message).toMatch(/\(line 3, column 10\)$/);
    }
  });
});

describe('subgraphs', () => {
  it('nests subgraphs with titles and directions', () => {
    const c = parse(`flowchart TD
subgraph outer [Outer box]
  direction LR
  a --> b
  subgraph inner
    c
  end
end
subgraph "Quoted title"
  d
end
subgraph two words here
  e
end
x --> a`);
    expect(c.subgraphs.get('outer')).toMatchObject({ title: 'Outer box', direction: 'LR', parent: null });
    expect(c.subgraphs.get('inner')).toMatchObject({ title: 'inner', parent: 'outer', direction: null });
    expect(c.nodes.get('a')!.parent).toBe('outer');
    expect(c.nodes.get('c')!.parent).toBe('inner');
    expect(c.nodes.get('x')!.parent).toBeNull();
    const titles = [...c.subgraphs.values()].map((s) => s.title);
    expect(titles).toContain('Quoted title');
    expect(titles).toContain('two words here');
  });

  it('moves a node mentioned first at top level into its subgraph', () => {
    const c = parse('flowchart TD\nA --> B\nsubgraph S\n  B\nend');
    expect(c.nodes.get('B')!.parent).toBe('S');
    expect(c.nodes.get('A')!.parent).toBeNull();
  });

  it('treats subgraph ids used as endpoints as the subgraph', () => {
    const c = parse('flowchart TD\nA --> S\nsubgraph S\n  B\nend\nS --> C');
    expect(c.nodes.has('S')).toBe(false);
    expect(edges('flowchart TD\nA --> S\nsubgraph S\n  B\nend')).toEqual(['A>S']);
  });

  it('drops edges between a node and its own subgraph', () => {
    const c = parse('flowchart TD\nsubgraph S\n  B --> S\nend');
    expect(c.edges).toHaveLength(0);
    expect(c.warnings.some((w) => /own subgraph/.test(w.message))).toBe(true);
  });

  it('reports unbalanced subgraphs and bad directions', () => {
    expect(() => parse('flowchart TD\nsubgraph S\nA')).toThrow(/never closed/);
    expect(() => parse('flowchart TD\nend')).toThrow(/without a matching 'subgraph'/);
    expect(() => parse('flowchart TD\nsubgraph S\ndirection UP\nend')).toThrow(/Unknown direction 'UP'/);
    expect(() => parse('flowchart TD\nsubgraph S\nend\nsubgraph S\nend')).toThrow(/declared twice/);
    expect(() => parse('flowchart TD\nsubgraph S [Unclosed\nend')).toThrow(/Unclosed '\['/);
    expect(() => parse('flowchart TD\nsubgraph')).toThrow(/Expected an id or title/);
  });

  it('lets a top-level direction statement set the diagram direction', () => {
    const c = parse('flowchart TD\ndirection LR\nA');
    expect(c.direction).toBe('LR');
    expect(c.warnings[0].message).toMatch(/outside a subgraph/);
  });
});

describe('styling', () => {
  it('parses classDef, class, ::: and style', () => {
    const c = parse(`flowchart TD
A:::hot --> B
classDef hot fill:#f96,stroke:#333,stroke-width:2px
classDef a,b color:red
class B,C hot
style A fill:rgb(1, 2, 3),opacity:0.5`);
    expect(c.classDefs.get('hot')).toEqual({ fill: '#f96', stroke: '#333', 'stroke-width': '2px' });
    expect(c.classDefs.get('b')).toEqual({ color: 'red' });
    expect(c.nodes.get('A')!.classes).toEqual(['hot']);
    expect(c.nodes.get('C')!.classes).toEqual(['hot']);
    expect(c.nodes.get('A')!.style).toEqual({ fill: 'rgb(1, 2, 3)', opacity: '0.5' });
  });

  it('applies linkStyle by index and default', () => {
    const c = parse('flowchart TD\nA-->B\nB-->C\nlinkStyle default stroke:#999\nlinkStyle 1 stroke:#f00,stroke-width:3px\nlinkStyle 7 stroke:#0f0');
    expect(c.edges[0].style).toEqual({ stroke: '#999' });
    expect(c.edges[1].style).toEqual({ stroke: '#f00', 'stroke-width': '3px' });
    expect(c.warnings.some((w) => /no edge with that index/.test(w.message))).toBe(true);
    expect(() => parse('flowchart TD\nlinkStyle x stroke:#f00')).toThrow(/edge index/);
  });

  it('styles subgraphs too', () => {
    const c = parse('flowchart TD\nsubgraph S\nA\nend\nstyle S fill:#eee\nclass S warm');
    expect(c.subgraphs.get('S')!.style).toEqual({ fill: '#eee' });
    expect(c.subgraphs.get('S')!.classes).toEqual(['warm']);
  });

  it('drops unsafe or unknown style values with a warning', () => {
    const w: { line: number; col: number; message: string }[] = [];
    const s = parseStyleList('fill:#fff,background:red,stroke:url("x"),nonsense', w, { line: 1, col: 1, offset: 0 });
    expect(s).toEqual({ fill: '#fff' });
    expect(w).toHaveLength(3);
  });

  it('ignores click with a warning and rejects malformed class statements', () => {
    const c = parse('flowchart TD\nA\nclick A "https://example.com"');
    expect(c.warnings[0].message).toMatch(/click/);
    expect(() => parse('flowchart TD\nclass A')).toThrow(/class name/);
    expect(() => parse('flowchart TD\nclassDef')).toThrow(/class name/);
    expect(() => parse('flowchart TD\nA:::')).toThrow(/class name/);
    expect(() => parse('flowchart TD\nstyle')).toThrow(/node id after 'style'/);
  });
});

describe('decodeLabel', () => {
  it('trims each line and decodes entities', () => {
    expect(decodeLabel('  a <br> b \\n c ')).toBe('a\nb\nc');
    expect(decodeLabel('#35;1')).toBe('#1');
  });
});
