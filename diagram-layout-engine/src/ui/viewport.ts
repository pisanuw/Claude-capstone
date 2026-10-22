// Pan and zoom container for a rendered SVG: drag or scroll to pan,
// ctrl/cmd + wheel (or pinch) and the buttons to zoom, double-click to fit.

export class Viewport {
  readonly el: HTMLElement;
  readonly inner: HTMLElement;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private natural = { w: 1, h: 1 };
  private drag: { x: number; y: number; tx: number; ty: number; id: number } | null = null;
  /** True when the last pointer gesture was a pan, so clicks can be ignored. */
  moved = false;
  onZoom: (scale: number) => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.classList.add('vp');
    this.inner = document.createElement('div');
    this.inner.className = 'vp-inner';
    this.el.appendChild(this.inner);
    this.el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('dblclick', (e) => {
      if (!(e.target as Element).closest('.dle-node')) this.fit();
    });
  }

  setSvg(svg: string, keepView: boolean): void {
    this.inner.innerHTML = svg;
    const s = this.inner.querySelector('svg');
    this.natural = { w: Number(s?.getAttribute('width') ?? 1), h: Number(s?.getAttribute('height') ?? 1) };
    if (keepView) this.apply();
    else this.fit();
  }

  fit(): void {
    const cw = this.el.clientWidth || 600;
    const ch = this.el.clientHeight || 400;
    this.scale = Math.min(1.25, (cw - 24) / this.natural.w, (ch - 24) / this.natural.h);
    if (!Number.isFinite(this.scale) || this.scale <= 0) this.scale = 1;
    this.tx = (cw - this.natural.w * this.scale) / 2;
    this.ty = Math.max(12, (ch - this.natural.h * this.scale) / 2);
    this.apply();
  }

  actual(): void {
    const cw = this.el.clientWidth;
    this.scale = 1;
    this.tx = Math.max(12, (cw - this.natural.w) / 2);
    this.ty = 12;
    this.apply();
  }

  zoomBy(f: number, cx = this.el.clientWidth / 2, cy = this.el.clientHeight / 2): void {
    const next = Math.min(6, Math.max(0.1, this.scale * f));
    const k = next / this.scale;
    this.tx = cx - (cx - this.tx) * k;
    this.ty = cy - (cy - this.ty) * k;
    this.scale = next;
    this.apply();
  }

  private apply(): void {
    this.inner.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    this.onZoom(this.scale);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // Pinch gestures arrive as ctrl+wheel.
      this.zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
    } else {
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
      this.apply();
    }
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.moved = false;
    this.drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, id: e.pointerId };
  }

  private move(e: PointerEvent): void {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      this.moved = true;
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('vp-dragging');
    }
    this.tx = this.drag.tx + dx;
    this.ty = this.drag.ty + dy;
    this.apply();
  }

  private up(e: PointerEvent): void {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.drag = null;
    this.el.classList.remove('vp-dragging');
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
  }
}
