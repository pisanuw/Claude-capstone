/**
 * SVG signal-path view: keyboard/lamps, plugboard, three rotors and the
 * reflector as boxes with 26 contacts each, with the traced path of the
 * last keypress drawn through them (orange outbound, blue on the way back).
 */
import { ALPHABET, N, chr, type Enigma, type Trace, type RotorState, rotorFwd } from '../core/enigma';

const SVG = 'http://www.w3.org/2000/svg';
const ROW = 13;
const TOP = 34;
const BOX_W = 84;
const GAP = 34;
const KEY_W = 26;
const PAD = 10;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

const yOf = (i: number): number => TOP + i * ROW + ROW / 2;

interface Column {
  x: number;
  label: string;
  sub: string;
}

export interface WiringOptions {
  showAllWiring: boolean;
}

export function renderWiring(container: HTMLElement, machine: Enigma, trace: Trace | null, opts: WiringOptions): void {
  const cols: Column[] = [];
  let x = PAD + KEY_W + GAP;
  const names = ['Plugboard', `Rotor ${machine.right.spec.name}`, `Rotor ${machine.middle.spec.name}`, `Rotor ${machine.left.spec.name}`, `Reflector ${machine.reflectorName}`];
  const subs = [
    pairsLabel(machine),
    `window ${chr(machine.right.pos)} · ring ${chr(machine.right.ring)}`,
    `window ${chr(machine.middle.pos)} · ring ${chr(machine.middle.ring)}`,
    `window ${chr(machine.left.pos)} · ring ${chr(machine.left.ring)}`,
    '13 pairs',
  ];
  for (let k = 0; k < 5; k++) {
    cols.push({ x, label: names[k], sub: subs[k] });
    x += BOX_W + GAP;
  }
  const width = x - GAP + PAD;
  const height = TOP + N * ROW + 12;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'wiring', role: 'img', 'aria-label': 'Enigma signal path' });

  // Keyboard / lampboard column.
  for (let i = 0; i < N; i++) {
    const isIn = trace?.input === i;
    const isOut = trace?.output === i;
    const g = el('g', { class: 'key' + (isIn ? ' key-in' : '') + (isOut ? ' key-out' : '') });
    g.appendChild(el('circle', { cx: PAD + KEY_W / 2, cy: yOf(i), r: 5.5 }));
    g.appendChild(el('text', { x: PAD + KEY_W / 2, y: yOf(i) + 3.3, 'text-anchor': 'middle' }, ALPHABET[i]));
    svg.appendChild(g);
  }
  svg.appendChild(el('text', { x: PAD + KEY_W / 2, y: TOP - 18, class: 'col-label', 'text-anchor': 'middle' }, 'Keys'));
  svg.appendChild(el('text', { x: PAD + KEY_W / 2, y: TOP - 6, class: 'col-sub', 'text-anchor': 'middle' }, 'lamps'));

  // Boxes with contact labels.
  cols.forEach((c, k) => {
    svg.appendChild(el('rect', { x: c.x, y: TOP - 2, width: BOX_W, height: N * ROW + 4, rx: 4, class: k === 4 ? 'box reflector' : k === 0 ? 'box plugboard' : 'box rotor' }));
    svg.appendChild(el('text', { x: c.x + BOX_W / 2, y: TOP - 18, class: 'col-label', 'text-anchor': 'middle' }, c.label));
    svg.appendChild(el('text', { x: c.x + BOX_W / 2, y: TOP - 6, class: 'col-sub', 'text-anchor': 'middle' }, c.sub));
    for (let i = 0; i < N; i++) {
      svg.appendChild(el('text', { x: c.x + 3, y: yOf(i) + 3, class: 'contact' }, ALPHABET[i]));
      if (k < 4) svg.appendChild(el('text', { x: c.x + BOX_W - 3, y: yOf(i) + 3, class: 'contact', 'text-anchor': 'end' }, ALPHABET[i]));
    }
  });

  // Faint full wiring of every component.
  if (opts.showAllWiring) {
    const plug = machine.plug;
    for (let i = 0; i < N; i++) svg.appendChild(line(cols[0], i, plug[i], 'wire'));
    const rotors: RotorState[] = [machine.right, machine.middle, machine.left];
    rotors.forEach((r, k) => {
      for (let i = 0; i < N; i++) svg.appendChild(line(cols[k + 1], i, rotorFwd(r, i), 'wire'));
    });
    for (let i = 0; i < N; i++) {
      const j = machine.reflector[i];
      if (j > i) svg.appendChild(arc(cols[4], i, j, 'wire'));
    }
  }

  // The traced path.
  if (trace) {
    const fwdCols = [0, 1, 2, 3];
    trace.hops.forEach((h, n) => {
      const cls = n < 4 ? 'path fwd' : n === 4 ? 'path refl' : 'path bwd';
      if (h.component === 'reflector') {
        svg.appendChild(arc(cols[4], h.from, h.to, cls));
        return;
      }
      const k = n < 4 ? fwdCols[n] : 8 - n; // back hops: 5->3, 6->2, 7->1, 8->0
      const forward = n < 4;
      const c = cols[k];
      const x1 = forward ? c.x + 8 : c.x + BOX_W - 8;
      const x2 = forward ? c.x + BOX_W - 8 : c.x + 8;
      svg.appendChild(el('line', { x1, y1: yOf(h.from), x2, y2: yOf(h.to), class: cls }));
      // Link to the neighbour on the side the signal leaves by.
      if (forward) {
        const nx = k < 4 ? cols[k + 1].x + 8 : c.x + BOX_W;
        svg.appendChild(el('line', { x1: x2, y1: yOf(h.to), x2: nx, y2: yOf(h.to), class: cls }));
      } else {
        const nx = k > 0 ? cols[k - 1].x + BOX_W - 8 : PAD + KEY_W / 2 + 6;
        svg.appendChild(el('line', { x1: x2, y1: yOf(h.to), x2: nx, y2: yOf(h.to), class: cls }));
      }
    });
    // Keys to plugboard.
    svg.appendChild(el('line', { x1: PAD + KEY_W / 2 + 6, y1: yOf(trace.input), x2: cols[0].x + 8, y2: yOf(trace.input), class: 'path fwd' }));
  }

  container.replaceChildren(svg);
}

function line(c: Column, from: number, to: number, cls: string): SVGLineElement {
  return el('line', { x1: c.x + 8, y1: yOf(from), x2: c.x + BOX_W - 8, y2: yOf(to), class: cls });
}

function arc(c: Column, from: number, to: number, cls: string): SVGPathElement {
  const x = c.x + 8;
  const y1 = yOf(from);
  const y2 = yOf(to);
  const bulge = 10 + Math.abs(to - from) * 2.2;
  return el('path', { d: `M ${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x} ${y2}`, class: cls, fill: 'none' });
}

function pairsLabel(m: Enigma): string {
  let n = 0;
  for (let i = 0; i < N; i++) if (m.plug[i] > i) n++;
  return n === 0 ? 'no plugs' : `${n} plug${n === 1 ? '' : 's'}`;
}
