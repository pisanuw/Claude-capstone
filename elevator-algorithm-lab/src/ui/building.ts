import type { Frame, Scenario } from '../core/types';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Floor rows are thinned when a building is too tall to label every floor. */
function labelStep(floors: number): number {
  if (floors <= 25) return 1;
  if (floors <= 60) return 5;
  if (floors <= 250) return 25;
  return 50;
}

export interface BuildingLayout {
  width: number;
  height: number;
  rowH: number;
  top: number;
  shaftX: (car: number) => number;
  shaftW: number;
  floorY: (floor: number) => number;
}

export function layoutBuilding(scenario: Scenario, width: number): BuildingLayout {
  const floors = scenario.floors;
  const rowH = Math.max(3, Math.min(22, Math.floor(420 / floors)));
  const top = 14;
  const height = top + rowH * floors + 10;
  const labelW = 44;
  const waitingW = 54;
  const shaftsX = labelW + waitingW;
  const shaftArea = Math.max(60, width - shaftsX - 10);
  const shaftW = Math.min(44, Math.floor(shaftArea / scenario.cars) - 6);
  return {
    width,
    height,
    rowH,
    top,
    shaftW,
    shaftX: (car) => shaftsX + car * (shaftW + 6),
    floorY: (floor) => top + (floors - 1 - floor) * rowH,
  };
}

/**
 * Draw one frame of a building: floor lines, waiting counts per floor, and a
 * car per shaft with its load and direction arrow. Redraws everything; the
 * SVG is small enough that this is cheap.
 */
export function renderBuilding(svg: SVGSVGElement, scenario: Scenario, frame: Frame, width = 320): void {
  const L = layoutBuilding(scenario, width);
  svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
  svg.setAttribute('width', String(L.width));
  svg.setAttribute('height', String(L.height));
  svg.replaceChildren();

  const step = labelStep(scenario.floors);
  const isDisk = scenario.kind === 'disk';
  for (let f = 0; f < scenario.floors; f++) {
    const y = L.floorY(f);
    if (f % step === 0 || L.rowH >= 10) {
      svg.appendChild(svgEl('line', { x1: 40, x2: L.width - 4, y1: y + L.rowH, y2: y + L.rowH, class: 'floor-line' }));
    }
    if (f % step === 0) {
      svg.appendChild(svgEl('text', { x: 36, y: y + L.rowH - Math.max(1, (L.rowH - 10) / 2), class: 'floor-label' }, String(f)));
    }
    const waiting = frame.waiting[f];
    if (waiting > 0) {
      const cx = 56;
      const dots = Math.min(waiting, 4);
      for (let d = 0; d < dots; d++) {
        svg.appendChild(svgEl('circle', { cx: cx + d * 7, cy: y + L.rowH / 2, r: Math.min(3, L.rowH / 2 - 0.5), class: 'waiting-dot' }));
      }
      if (waiting > 4 || L.rowH < 8) {
        svg.appendChild(svgEl('text', { x: cx + dots * 7 + 4, y: y + L.rowH / 2 + 3.5, class: 'waiting-count' }, `×${waiting}`));
      }
    }
  }

  frame.cars.forEach((car, i) => {
    const x = L.shaftX(i);
    svg.appendChild(svgEl('rect', { x, y: L.top, width: L.shaftW, height: L.rowH * scenario.floors, class: 'shaft' }));
    if (car.target !== null) {
      const ty = L.floorY(car.target);
      svg.appendChild(svgEl('rect', { x, y: ty, width: L.shaftW, height: L.rowH, class: 'target-mark' }));
    }
    const y = L.floorY(car.floor);
    const h = Math.max(L.rowH, 6);
    const cls = `car${car.doors ? ' doors-open' : ''}${isDisk ? ' head' : ''}`;
    svg.appendChild(svgEl('rect', { x: x + 1, y: y + (L.rowH - h) / 2, width: L.shaftW - 2, height: h, rx: 2, class: cls }));
    if (!isDisk && L.shaftW >= 24) {
      const arrow = car.direction > 0 ? '▲' : car.direction < 0 ? '▼' : '';
      svg.appendChild(svgEl('text', { x: x + L.shaftW / 2, y: y + L.rowH / 2 + 3.5, class: 'car-label', 'text-anchor': 'middle' }, `${arrow}${car.load}`));
    }
    svg.appendChild(svgEl('text', { x: x + L.shaftW / 2, y: L.top - 4, class: 'shaft-label', 'text-anchor': 'middle' }, isDisk ? 'head' : `car ${i}`));
  });
}
