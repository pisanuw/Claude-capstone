// Hand-written recursive-descent parser for a Mermaid flowchart subset.
//
// Supported: `flowchart`/`graph` header with a direction, node shapes, quoted
// and raw labels, `<br>` line breaks, edge chains (`A --> B --> C`), `&`
// groups, edge labels in both `-->|text|` and `-- text -->` form, solid,
// thick, dotted and invisible links, `o`/`x`/`<` heads, longer links for extra
// layers, nested subgraphs with their own `direction`, `classDef`, `class`,
// `:::`, `style`, `linkStyle` and `%%` comments. The first error stops the
// parse with a line and column; ignorable constructs become warnings.

import type {
  ArrowHead,
  Direction,
  FlowEdge,
  FlowNode,
  FlowSubgraph,
  Flowchart,
  LineStyle,
  NodeShape,
  SourcePos,
  StyleMap,
  Warning,
} from './types';

export class ParseError extends Error {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
  readonly length: number;

  constructor(message: string, pos: SourcePos, length = 1) {
    super(`${message} (line ${pos.line}, column ${pos.col})`);
    this.name = 'ParseError';
    this.line = pos.line;
    this.col = pos.col;
    this.offset = pos.offset;
    this.length = Math.max(1, length);
  }

  /** The bare message without the position suffix. */
  get detail(): string {
    return this.message.replace(/ \(line \d+, column \d+\)$/, '');
  }
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };

/** Style properties copied through to SVG; anything else is dropped with a warning. */
const STYLE_PROPS = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'color',
  'font-weight',
  'font-style',
  'font-size',
  'opacity',
]);

interface ShapeSpec {
  open: string;
  closes: { close: string; shape: NodeShape }[];
}

// Longest openers first so `((` wins over `(`.
const SHAPES: ShapeSpec[] = [
  { open: '(((', closes: [{ close: ')))', shape: 'doublecircle' }] },
  { open: '((', closes: [{ close: '))', shape: 'circle' }] },
  { open: '([', closes: [{ close: '])', shape: 'stadium' }] },
  { open: '[[', closes: [{ close: ']]', shape: 'subroutine' }] },
  { open: '[(', closes: [{ close: ')]', shape: 'cylinder' }] },
  {
    open: '[/',
    closes: [
      { close: '/]', shape: 'parallelogram' },
      { close: '\\]', shape: 'trapezoid' },
    ],
  },
  {
    open: '[\\',
    closes: [
      { close: '\\]', shape: 'parallelogram-alt' },
      { close: '/]', shape: 'trapezoid-alt' },
    ],
  },
  { open: '{{', closes: [{ close: '}}', shape: 'hexagon' }] },
  { open: '(', closes: [{ close: ')', shape: 'round' }] },
  { open: '[', closes: [{ close: ']', shape: 'rect' }] },
  { open: '{', closes: [{ close: '}', shape: 'diamond' }] },
  { open: '>', closes: [{ close: ']', shape: 'asymmetric' }] },
];

const KEYWORDS = new Set(['subgraph', 'end', 'direction', 'classDef', 'class', 'style', 'linkStyle', 'click']);

interface LinkToken {
  line: LineStyle;
  head: ArrowHead;
  tail: ArrowHead;
  minlen: number;
  label: string;
}

interface NodeRef {
  id: string;
  pos: SourcePos;
}

function markerOf(ch: string | undefined): ArrowHead {
  if (ch === '>' || ch === '<') return 'arrow';
  if (ch === 'o') return 'circle';
  if (ch === 'x') return 'cross';
  return 'none';
}

/** Decode the small set of entities Mermaid users actually write. */
export function decodeLabel(raw: string): string {
  return raw
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, '&')
    .replace(/#lt;/g, '<')
    .replace(/#gt;/g, '>')
    .replace(/#35;/g, '#')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

export function parseStyleList(text: string, warnings: Warning[], pos: SourcePos): StyleMap {
  const out: StyleMap = {};
  let depth = 0;
  let cur = '';
  const parts: string[] = [];
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const p = part.trim().replace(/;$/, '');
    if (!p) continue;
    const colon = p.indexOf(':');
    if (colon < 1) {
      warnings.push({ line: pos.line, col: pos.col, message: `Ignored style '${p}': expected property:value` });
      continue;
    }
    const prop = p.slice(0, colon).trim().toLowerCase();
    const value = p.slice(colon + 1).trim();
    if (!STYLE_PROPS.has(prop)) {
      warnings.push({ line: pos.line, col: pos.col, message: `Ignored unsupported style property '${prop}'` });
      continue;
    }
    if (!/^[#\w\s.,%()-]+$/.test(value)) {
      warnings.push({ line: pos.line, col: pos.col, message: `Ignored style value '${value}' for '${prop}'` });
      continue;
    }
    out[prop] = value;
  }
  return out;
}

class Parser {
  private i = 0;
  private readonly lineStarts: number[] = [0];
  private readonly chart: Flowchart;
  private readonly stack: FlowSubgraph[] = [];
  private edgeCount = 0;
  /** linkStyle statements are applied once all edges exist. */
  private readonly linkStyles: { targets: number[] | 'default'; style: StyleMap; pos: SourcePos }[] = [];
  /** Nodes referenced as edge endpoints, used to detect subgraph endpoints. */
  private readonly implicit = new Set<string>();
  /** Nodes whose label or shape were given explicitly, so a bare reference does not reset them. */
  private readonly declared = new Set<string>();

  constructor(private readonly src: string) {
    for (let k = 0; k < src.length; k++) if (src[k] === '\n') this.lineStarts.push(k + 1);
    this.chart = {
      direction: 'TB',
      nodes: new Map(),
      edges: [],
      subgraphs: new Map(),
      classDefs: new Map(),
      warnings: [],
    };
  }

  pos(offset = this.i): SourcePos {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1, offset };
  }

  private fail(message: string, offset = this.i, length = 1): never {
    throw new ParseError(message, this.pos(offset), length);
  }

  private warn(message: string, offset = this.i): void {
    const p = this.pos(offset);
    this.chart.warnings.push({ line: p.line, col: p.col, message });
  }

  private peek(n = 0): string | undefined {
    return this.src[this.i + n];
  }

  private startsWith(s: string): boolean {
    return this.src.startsWith(s, this.i);
  }

  private skipSpaces(): void {
    while (this.i < this.src.length && (this.src[this.i] === ' ' || this.src[this.i] === '\t' || this.src[this.i] === '\r'))
      this.i++;
  }

  /** At a statement boundary: end of input, newline, `;` or a comment. */
  private atEnd(): boolean {
    this.skipSpaces();
    const c = this.peek();
    return c === undefined || c === '\n' || c === ';' || this.startsWith('%%');
  }

  private restOfLine(): string {
    const start = this.i;
    while (this.i < this.src.length && this.src[this.i] !== '\n' && this.src[this.i] !== ';') {
      if (this.startsWith('%%')) break;
      this.i++;
    }
    return this.src.slice(start, this.i).trim();
  }

  /** Skip blank lines, `;` separators and comments. */
  private skipTrivia(): void {
    for (;;) {
      this.skipSpaces();
      if (this.startsWith('%%')) {
        while (this.i < this.src.length && this.src[this.i] !== '\n') this.i++;
        continue;
      }
      const c = this.peek();
      if (c === '\n' || c === ';') {
        this.i++;
        continue;
      }
      return;
    }
  }

  private endStatement(): void {
    if (!this.atEnd()) {
      const tok = this.src.slice(this.i).match(/^\S+/)?.[0] ?? '';
      this.fail(`Unexpected '${tok}': expected the end of the statement`, this.i, tok.length);
    }
  }

  private word(): string {
    const m = this.src.slice(this.i, this.i + 32).match(/^[A-Za-z]+/);
    return m ? m[0] : '';
  }

  private identifier(): string | null {
    // Letters, digits and underscores only: allowing `-` would make `A-->B` ambiguous.
    const m = this.src.slice(this.i, this.i + 256).match(/^[\p{L}\p{N}_]+/u);
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }

  parse(): Flowchart {
    this.skipTrivia();
    this.header();
    for (;;) {
      this.skipTrivia();
      if (this.i >= this.src.length) break;
      this.statement();
    }
    if (this.stack.length) {
      const sg = this.stack[this.stack.length - 1];
      this.fail(`Subgraph '${sg.id}' opened here is never closed with 'end'`, sg.pos.offset, 8);
    }
    this.finish();
    return this.chart;
  }

  private header(): void {
    const start = this.i;
    const w = this.word();
    if (w !== 'flowchart' && w !== 'graph') {
      this.fail(
        w ? `Unknown diagram type '${w}': only 'flowchart' and 'graph' are supported` : "Missing header: start with 'flowchart TD' or 'graph LR'",
        start,
        Math.max(1, w.length),
      );
    }
    this.i += w.length;
    this.skipSpaces();
    if (!this.atEnd()) {
      const dStart = this.i;
      const d = this.word();
      const dir = DIRECTIONS[d];
      if (!dir) this.fail(`Unknown direction '${d || this.peek()}': use TB, TD, BT, LR or RL`, dStart, Math.max(1, d.length));
      this.chart.direction = dir;
      this.i += d.length;
    }
    this.endStatement();
  }

  private statement(): void {
    const start = this.i;
    const w = this.word();
    const next = this.src[this.i + w.length];
    const isKeyword = KEYWORDS.has(w) && (next === undefined || /[\s;]/.test(next));
    if (isKeyword) {
      this.i += w.length;
      this.skipSpaces();
      switch (w) {
        case 'subgraph':
          return this.subgraph(start);
        case 'end':
          if (!this.stack.length) this.fail("'end' without a matching 'subgraph'", start, 3);
          this.stack.pop();
          return this.endStatement();
        case 'direction':
          return this.directionStmt(start);
        case 'classDef':
          return this.classDef();
        case 'class':
          return this.classStmt();
        case 'style':
          return this.styleStmt();
        case 'linkStyle':
          return this.linkStyle(start);
        case 'click':
          this.restOfLine();
          return this.warn("'click' interactions are ignored", start);
      }
    }
    this.chain();
  }

  private subgraph(start: number): void {
    if (this.atEnd()) this.fail("Expected an id or title after 'subgraph'");
    let id: string | null = null;
    let title: string;
    const idStart = this.i;
    if (this.peek() === '"') {
      title = this.quoted();
    } else {
      id = this.identifier();
      if (id === null) this.fail("Expected an id or title after 'subgraph'");
      this.skipSpaces();
      if (this.peek() === '[') {
        this.i++;
        this.skipSpaces();
        if (this.peek() === '"') {
          title = this.quoted();
          this.skipSpaces();
          if (this.peek() !== ']') this.fail("Expected ']' to close the subgraph title");
          this.i++;
        } else {
          const close = this.src.indexOf(']', this.i);
          const eol = this.src.indexOf('\n', this.i);
          if (close < 0 || (eol >= 0 && close > eol)) this.fail("Unclosed '[' in subgraph title: expected ']'", idStart);
          title = this.src.slice(this.i, close);
          this.i = close + 1;
        }
      } else if (!this.atEnd()) {
        // `subgraph Some title words` uses the whole line as the title.
        title = `${id} ${this.restOfLine()}`;
        id = null;
      } else title = id;
    }
    if (id === null) id = `subgraph${this.chart.subgraphs.size + 1}`;
    if (this.chart.subgraphs.has(id)) this.fail(`Subgraph '${id}' is declared twice`, idStart, id.length);
    const sg: FlowSubgraph = {
      id,
      title: decodeLabel(title),
      direction: null,
      parent: this.stack.length ? this.stack[this.stack.length - 1].id : null,
      classes: [],
      style: {},
      pos: this.pos(start),
    };
    this.chart.subgraphs.set(id, sg);
    this.stack.push(sg);
    this.endStatement();
  }

  private directionStmt(start: number): void {
    const dStart = this.i;
    const d = this.word();
    const dir = DIRECTIONS[d];
    if (!dir) this.fail(`Unknown direction '${d || (this.peek() ?? '')}': use TB, TD, BT, LR or RL`, dStart, Math.max(1, d.length));
    this.i += d.length;
    if (!this.stack.length) {
      this.warn("'direction' outside a subgraph sets the whole diagram's direction", start);
      this.chart.direction = dir;
    } else this.stack[this.stack.length - 1].direction = dir;
    this.endStatement();
  }

  private classDef(): void {
    const names: string[] = [];
    do {
      this.skipSpaces();
      const n = this.identifier();
      if (!n) this.fail("Expected a class name after 'classDef'");
      names.push(n);
      this.skipSpaces();
    } while (this.peek() === ',' && ++this.i);
    const p = this.pos();
    const style = parseStyleList(this.restOfLine(), this.chart.warnings, p);
    for (const n of names) this.chart.classDefs.set(n, { ...(this.chart.classDefs.get(n) ?? {}), ...style });
  }

  private idList(what: string): NodeRef[] {
    const ids: NodeRef[] = [];
    do {
      this.skipSpaces();
      const p = this.pos();
      const id = this.identifier();
      if (!id) this.fail(`Expected a node id after '${what}'`);
      ids.push({ id, pos: p });
      this.skipSpaces();
    } while (this.peek() === ',' && ++this.i);
    return ids;
  }

  private classStmt(): void {
    const ids = this.idList('class');
    this.skipSpaces();
    const cls = this.identifier();
    if (!cls) this.fail('Expected a class name after the node list');
    for (const { id, pos } of ids) {
      const target = this.chart.subgraphs.get(id) ?? this.touchNode(id, pos);
      if (!target.classes.includes(cls)) target.classes.push(cls);
    }
    this.endStatement();
  }

  private styleStmt(): void {
    const p = this.pos();
    const id = this.identifier();
    if (!id) this.fail("Expected a node id after 'style'");
    this.skipSpaces();
    const style = parseStyleList(this.restOfLine(), this.chart.warnings, this.pos());
    const target = this.chart.subgraphs.get(id) ?? this.touchNode(id, p);
    Object.assign(target.style, style);
  }

  private linkStyle(start: number): void {
    let targets: number[] | 'default';
    if (this.word() === 'default') {
      targets = 'default';
      this.i += 7;
    } else {
      targets = [];
      do {
        this.skipSpaces();
        const m = this.src.slice(this.i).match(/^\d+/);
        if (!m) this.fail("Expected an edge index or 'default' after 'linkStyle'");
        targets.push(Number(m[0]));
        this.i += m[0].length;
        this.skipSpaces();
      } while (this.peek() === ',' && ++this.i);
    }
    this.skipSpaces();
    const style = parseStyleList(this.restOfLine(), this.chart.warnings, this.pos());
    this.linkStyles.push({ targets, style, pos: this.pos(start) });
  }

  private quoted(): string {
    const start = this.i;
    this.i++; // opening quote
    let out = '';
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === '\\' && this.src[this.i + 1] === '"') {
        out += '"';
        this.i += 2;
        continue;
      }
      if (c === '"') {
        this.i++;
        return out;
      }
      if (c === '\n') break;
      out += c;
      this.i++;
    }
    return this.fail('Unclosed string: expected a closing "', start);
  }

  private touchNode(id: string, pos: SourcePos): FlowNode {
    let node = this.chart.nodes.get(id);
    if (!node) {
      node = { id, label: id, shape: 'rect', classes: [], style: {}, parent: null, pos };
      this.chart.nodes.set(id, node);
    }
    return node;
  }

  private adopt(node: FlowNode): void {
    // A node belongs to the first subgraph that mentions it; top-level mentions
    // before that do not pin it to the root.
    if (node.parent === null && this.stack.length && node.id !== this.stack[this.stack.length - 1].id) {
      node.parent = this.stack[this.stack.length - 1].id;
    }
  }

  private nodeRef(): NodeRef {
    this.skipSpaces();
    const start = this.i;
    const id = this.identifier();
    if (id === null) {
      const c = this.peek();
      this.fail(c === undefined || c === '\n' ? 'Expected a node id before the end of the line' : `Expected a node id, found '${c}'`);
    }
    if (KEYWORDS.has(id) && id === 'end') this.fail("'end' is reserved: rename the node (for example 'End' or 'finish')", start, 3);
    const p = this.pos(start);
    const node = this.touchNode(id, p);
    this.adopt(node);
    const spec = SHAPES.find((s) => this.startsWith(s.open));
    if (spec && !(spec.open === '>' && this.src[this.i + 1] === '>')) {
      const openAt = this.i;
      this.i += spec.open.length;
      let text: string;
      let shape: NodeShape;
      const ws = this.i;
      this.skipSpaces();
      if (this.peek() === '"') {
        text = this.quoted();
        this.skipSpaces();
        const c = spec.closes.find((k) => this.startsWith(k.close));
        if (!c) this.fail(`Expected '${spec.closes[0].close}' to close the label of node '${id}'`);
        shape = c.shape;
        this.i += c.close.length;
      } else {
        this.i = ws;
        let best: { at: number; close: string; shape: NodeShape } | null = null;
        const eol = this.src.indexOf('\n', this.i);
        const limit = eol < 0 ? this.src.length : eol;
        for (const c of spec.closes) {
          const at = this.src.indexOf(c.close, this.i);
          if (at >= 0 && at < limit && (!best || at < best.at)) best = { at, ...c };
        }
        if (!best) this.fail(`Unclosed '${spec.open}' for node '${id}': expected '${spec.closes[0].close}' before the end of the line`, openAt, spec.open.length);
        text = this.src.slice(this.i, best.at);
        shape = best.shape;
        this.i = best.at + best.close.length;
      }
      const label = decodeLabel(text);
      if (this.declared.has(id) && (node.label !== label || node.shape !== shape)) {
        this.warn(`Node '${id}' redefined: the later label and shape win`, start);
      }
      node.label = label;
      node.shape = shape;
      this.declared.add(id);
    }
    if (this.startsWith(':::')) {
      this.i += 3;
      const cls = this.identifier();
      if (!cls) this.fail("Expected a class name after ':::'");
      if (!node.classes.includes(cls)) node.classes.push(cls);
    }
    return { id, pos: p };
  }

  private nodeGroup(): NodeRef[] {
    const group = [this.nodeRef()];
    for (;;) {
      this.skipSpaces();
      if (this.peek() !== '&') return group;
      this.i++;
      group.push(this.nodeRef());
    }
  }

  /** Try to read a link operator at the cursor; returns null if there is none. */
  private link(): LinkToken | null {
    this.skipSpaces();
    const rest = this.src.slice(this.i, this.src.indexOf('\n', this.i) < 0 ? undefined : this.src.indexOf('\n', this.i));
    let m: RegExpMatchArray | null;
    let tok: LinkToken | null = null;
    let used = 0;

    if ((m = rest.match(/^([<ox])?(~{3,})/))) {
      tok = { line: 'invisible', head: 'none', tail: 'none', minlen: m[2].length - 2, label: '' };
      used = m[0].length;
    } else if ((m = rest.match(/^([<ox])?-(\.+)-([>ox])?/))) {
      tok = { line: 'dotted', head: markerOf(m[3]), tail: markerOf(m[1]), minlen: m[2].length, label: '' };
      used = m[0].length;
    } else if ((m = rest.match(/^([<ox])?(-{2,}|={2,})([>ox])?/))) {
      const bar = m[2];
      const line: LineStyle = bar[0] === '=' ? 'thick' : 'solid';
      const headCh = m[3];
      // A bare `--` or `==` starts a text label: `-- yes -->`.
      if (bar.length === 2 && !headCh) {
        const close = line === 'thick' ? /(={2,}[>ox]|={3,})/ : /(-{2,}[>ox]|-{3,})/;
        const after = rest.slice(2);
        const cm = after.match(close);
        if (!cm || cm.index === undefined) {
          this.fail(`Unclosed link label: expected '${line === 'thick' ? '==>' : '-->'}' after the text`, this.i, 2);
        }
        const text = after.slice(0, cm.index);
        const op = cm[0];
        const head = /[>ox]$/.test(op) ? markerOf(op[op.length - 1]) : 'none';
        const dashes = op.length - (head === 'none' ? 0 : 1);
        tok = {
          line,
          head,
          tail: markerOf(m[1]),
          minlen: Math.max(1, dashes - (head === 'none' ? 2 : 1)),
          label: decodeLabel(text.replace(/^"(.*)"$/s, '$1').trim()),
        };
        used = 2 + cm.index + op.length;
      } else {
        const head = markerOf(headCh);
        tok = {
          line,
          head,
          tail: markerOf(m[1]),
          minlen: Math.max(1, bar.length - (head === 'none' ? 2 : 1)),
          label: '',
        };
        used = m[0].length;
      }
    } else if ((m = rest.match(/^([<ox])?-\.(?!-)/))) {
      // Dotted text link: `-. text .->`
      const after = rest.slice(m[0].length);
      const cm = after.match(/\.(-+)([>ox])?/);
      if (!cm || cm.index === undefined) this.fail("Unclosed dotted link label: expected '.->' after the text", this.i, 2);
      tok = {
        line: 'dotted',
        head: markerOf(cm[2]),
        tail: markerOf(m[1]),
        minlen: 1,
        label: decodeLabel(after.slice(0, cm.index).trim()),
      };
      used = m[0].length + cm.index + cm[0].length;
    }
    if (!tok) return null;
    // A `<` tail only means a double-headed arrow; `o`/`x` need a head too.
    if (tok.tail !== 'none' && tok.head === 'none' && rest[0] !== '<') {
      // `o--` without a head is unusual Mermaid; treat the marker as a plain end.
      tok.tail = 'none';
    }
    this.i += used;
    this.skipSpaces();
    if (this.peek() === '|') {
      const start = this.i;
      this.i++;
      this.skipSpaces();
      if (this.peek() === '"') {
        tok.label = decodeLabel(this.quoted());
        this.skipSpaces();
        if (this.peek() !== '|') this.fail("Expected '|' to close the edge label");
        this.i++;
        return tok;
      }
      const close = this.src.indexOf('|', this.i);
      const eol = this.src.indexOf('\n', this.i);
      if (close < 0 || (eol >= 0 && close > eol)) this.fail("Unclosed edge label: expected a closing '|'", start);
      const text = this.src.slice(this.i, close).trim();
      tok.label = decodeLabel(text.replace(/^"(.*)"$/s, '$1'));
      this.i = close + 1;
    }
    return tok;
  }

  private chain(): void {
    let left = this.nodeGroup();
    for (;;) {
      const linkAt = this.i;
      if (this.atEnd()) break;
      const tok = this.link();
      if (!tok) {
        const c = this.src.slice(this.i).match(/^\S+/)?.[0] ?? '';
        if (c[0] === '-' || c[0] === '=') this.fail(`Malformed link '${c}': try '-->', '---', '-.->' or '==>'`, this.i, c.length);
        this.fail(`Unexpected '${c}' after node '${left[left.length - 1].id}': expected a link like '-->' or the end of the line`, this.i, c.length);
      }
      this.skipSpaces();
      if (this.atEnd()) this.fail('Expected a node id after the link', linkAt, this.i - linkAt);
      const right = this.nodeGroup();
      for (const a of left) {
        for (const b of right) {
          this.implicit.add(a.id);
          this.implicit.add(b.id);
          const edge: FlowEdge = {
            id: `e${this.edgeCount++}`,
            from: a.id,
            to: b.id,
            label: tok.label,
            line: tok.line,
            head: tok.head,
            tail: tok.tail,
            minlen: tok.minlen,
            style: {},
            pos: this.pos(linkAt),
          };
          this.chart.edges.push(edge);
        }
      }
      left = right;
    }
    this.endStatement();
  }

  private finish(): void {
    const { nodes, subgraphs, edges, warnings } = this.chart;
    // Ids that name a subgraph refer to the cluster, not to a node.
    for (const id of subgraphs.keys()) {
      const n = nodes.get(id);
      if (n) {
        if (this.declared.has(id)) {
          warnings.push({ line: n.pos.line, col: n.pos.col, message: `'${id}' is both a node and a subgraph; edges use the subgraph` });
        }
        const sg = subgraphs.get(id)!;
        sg.classes.push(...n.classes.filter((c) => !sg.classes.includes(c)));
        Object.assign(sg.style, n.style);
        nodes.delete(id);
      }
    }
    // Drop edges between a node and a subgraph that contains it.
    const ancestors = (id: string): Set<string> => {
      const out = new Set<string>();
      let p = nodes.get(id)?.parent ?? subgraphs.get(id)?.parent ?? null;
      while (p) {
        out.add(p);
        p = subgraphs.get(p)?.parent ?? null;
      }
      return out;
    };
    this.chart.edges = edges.filter((e) => {
      if (ancestors(e.from).has(e.to) || ancestors(e.to).has(e.from)) {
        warnings.push({ line: e.pos.line, col: e.pos.col, message: `Edge ${e.from} -> ${e.to} links a node to its own subgraph and was dropped` });
        return false;
      }
      return true;
    });
    for (const ls of this.linkStyles) {
      if (ls.targets === 'default') {
        for (const e of this.chart.edges) e.style = { ...ls.style, ...e.style };
        continue;
      }
      for (const t of ls.targets) {
        const e = edges[t];
        if (!e) warnings.push({ line: ls.pos.line, col: ls.pos.col, message: `linkStyle ${t}: there is no edge with that index` });
        else Object.assign(e.style, ls.style);
      }
    }
  }
}

export function parse(src: string): Flowchart {
  return new Parser(src).parse();
}

export type ParseResult = { ok: true; chart: Flowchart } | { ok: false; error: ParseError };

export function tryParse(src: string): ParseResult {
  try {
    return { ok: true, chart: parse(src) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e };
    throw e;
  }
}
