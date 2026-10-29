// The board drawing: every chip as a package with labelled pins, the shared
// bus down the middle. Pins and bus lines are clickable probe points.

import { CHIP_IDS, CHIP_TITLES, NETS, PINS, type ChipId, netId, pinsOf, signalOfPin } from '../core/netlist';
import { Z } from '../core/sim';
import { svg } from './dom';

const PITCH = 15;
const CHIP_W = 150;
const HEAD = 26;
const GAP = 16;
const LEFT_X = 40;
const RIGHT_X = 610;
const BUS_X0 = 300;
const BUS_DX = 26;

const LEFT: ChipId[] = ['PC', 'MAR', 'RAM', 'IR', 'CTRL'];
const RIGHT: ChipId[] = ['A', 'ALU', 'B', 'FLAGS', 'OUT', 'CLK'];

export interface BoardView {
  /** The value to show for a signal, or undefined when it is unknown (not probed). */
  value(signal: number): number | undefined;
  selected: number | null;
  /** Signals drawn with a warning ring (they differ from a healthy board). */
  differs?: ReadonlySet<number>;
  /** Revealed fault location. */
  faultSignals?: ReadonlySet<number>;
  faultChip?: ChipId | null;
}

export class Board {
  readonly root: SVGSVGElement;
  private readonly marks = new Map<number, SVGElement>();
  private readonly chips = new Map<ChipId, SVGElement>();

  constructor(private readonly onPick: (signal: number) => void) {
    const height = Math.max(columnHeight(LEFT), columnHeight(RIGHT)) + 40;
    this.root = svg('svg', {
      viewBox: `0 0 800 ${height}`,
      class: 'board',
      role: 'img',
      'aria-label': 'Board with chips, pins and the shared bus',
    }) as SVGSVGElement;
    this.drawBus(height);
    this.drawColumn(LEFT, LEFT_X);
    this.drawColumn(RIGHT, RIGHT_X);
  }

  private drawBus(height: number) {
    const g = svg('g', { class: 'bus' });
    for (let i = 7; i >= 0; i--) {
      const x = BUS_X0 + (7 - i) * BUS_DX;
      const signal = netId(`BUS${i}`);
      const line = svg('line', { x1: `${x}`, y1: '30', x2: `${x}`, y2: `${height - 10}`, class: 'net' });
      const hit = svg('rect', { x: `${x - 9}`, y: '10', width: '18', height: `${height - 20}`, class: 'hit' });
      const label = svg('text', { x: `${x}`, y: '22', 'text-anchor': 'middle', class: 'netlabel' }, `B${i}`);
      const grp = svg('g', { class: 'probe', tabindex: '0' }, svg('title', {}, `BUS${i} (net)`), line, hit, label);
      grp.addEventListener('click', () => this.onPick(signal));
      grp.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && this.onPick(signal));
      g.append(grp);
      this.marks.set(signal, line);
    }
    this.root.append(g);
  }

  private drawColumn(ids: ChipId[], x: number) {
    let y = 30;
    for (const id of ids) {
      y += this.drawChip(id, x, y) + GAP;
    }
  }

  private drawChip(id: ChipId, x: number, y: number): number {
    const pins = pinsOf(id);
    const rows = Math.ceil(pins.length / 2);
    const h = HEAD + rows * PITCH + 6;
    const g = svg('g', { class: 'chip' });
    const body = svg('rect', { x: `${x}`, y: `${y}`, width: `${CHIP_W}`, height: `${h}`, rx: '4', class: 'pkg' });
    const notch = svg('path', { d: `M${x + CHIP_W / 2 - 8} ${y} a8 8 0 0 0 16 0`, class: 'notch' });
    const title = svg('text', { x: `${x + CHIP_W / 2}`, y: `${y + 17}`, 'text-anchor': 'middle', class: 'chipname' }, id);
    g.append(svg('title', {}, CHIP_TITLES[id]), body, notch, title);
    pins.forEach((p, k) => {
      const left = k < rows;
      const row = left ? k : pins.length - 1 - k; // DIP numbering runs down the left, up the right
      const py = y + HEAD + row * PITCH + PITCH / 2;
      const px = left ? x - 8 : x + CHIP_W;
      const def = PINS[p];
      const signal = signalOfPin(p);
      const mark = svg('rect', { x: `${px}`, y: `${py - 4}`, width: '8', height: '8', class: 'pin' });
      const label = svg(
        'text',
        { x: `${left ? x + 5 : x + CHIP_W - 5}`, y: `${py + 3.5}`, 'text-anchor': left ? 'start' : 'end', class: 'pinlabel' },
        def.name,
      );
      const hit = svg('rect', { x: `${left ? px - 4 : x + CHIP_W / 2}`, y: `${py - PITCH / 2}`, width: `${CHIP_W / 2 + 12}`, height: `${PITCH}`, class: 'hit' });
      const grp = svg(
        'g',
        { class: 'probe', tabindex: '0' },
        svg('title', {}, `${def.id} (${def.dir === 'in' ? 'input' : 'output'}, net ${NETS[def.net].name})`),
        hit,
        mark,
        label,
      );
      grp.addEventListener('click', () => this.onPick(signal));
      grp.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && this.onPick(signal));
      g.append(grp);
      this.marks.set(signal, mark);
    });
    this.root.append(g);
    this.chips.set(id, body);
    return h;
  }

  update(view: BoardView): void {
    for (const [signal, node] of this.marks) {
      const v = view.value(signal);
      const cls = [node.tagName === 'line' ? 'net' : 'pin'];
      cls.push(v === undefined ? 'unknown' : v === Z ? 'vz' : v ? 'v1' : 'v0');
      if (view.selected === signal) cls.push('selected');
      if (view.differs?.has(signal)) cls.push('differs');
      if (view.faultSignals?.has(signal)) cls.push('fault');
      node.setAttribute('class', cls.join(' '));
    }
    for (const id of CHIP_IDS) {
      this.chips.get(id)!.setAttribute('class', view.faultChip === id ? 'pkg fault' : 'pkg');
    }
  }
}

function columnHeight(ids: ChipId[]): number {
  return ids.reduce((sum, id) => sum + HEAD + Math.ceil(pinsOf(id).length / 2) * PITCH + 6 + GAP, 30);
}
