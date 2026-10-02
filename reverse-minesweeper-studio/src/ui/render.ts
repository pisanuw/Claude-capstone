import type { Board } from '../core/board';

export interface Palette {
  bg: string;
  hidden: string;
  open: string;
  grid: string;
  ink: string;
  mine: string;
  start: string;
  stuck: string;
  sealed: string;
  fresh: string;
  layout: string;
  suggest: string;
  exploded: string;
  numbers: string[];
}

export function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: '#0f1216',
        hidden: '#2a313a',
        open: '#171b21',
        grid: '#0b0d10',
        ink: '#e6e9ee',
        mine: '#e6e9ee',
        start: '#3fb950',
        stuck: '#e3b341',
        sealed: '#8a6d1f',
        fresh: 'rgba(76, 141, 255, 0.35)',
        layout: '#ff6b6b',
        suggest: '#c297ff',
        exploded: '#ff6b6b',
        numbers: ['', '#6ea8ff', '#3fb950', '#ff6b6b', '#a5a8ff', '#ff9e64', '#4fd1c5', '#e6e9ee', '#98a2ad'],
      }
    : {
        bg: '#f6f7f9',
        hidden: '#c9d0d8',
        open: '#ffffff',
        grid: '#f6f7f9',
        ink: '#1b1f24',
        mine: '#1b1f24',
        start: '#1a7f37',
        stuck: '#f2b134',
        sealed: '#f7d98b',
        fresh: 'rgba(31, 111, 235, 0.22)',
        layout: '#c62828',
        suggest: '#8250df',
        exploded: '#c62828',
        numbers: ['', '#1f4fd6', '#1a7f37', '#c62828', '#1b2a8c', '#8b1a1a', '#0f7b7b', '#1b1f24', '#5c6670'],
      };
}

/** What a single cell should look like; the caller decides from app state. */
export interface CellView {
  /** Hidden tile, open tile, or bare background (editor drawing). */
  face: 'hidden' | 'open' | 'blank';
  mine?: boolean;
  flag?: boolean;
  number?: number;
  start?: boolean;
  tint?: 'stuck' | 'sealed' | 'fresh' | null;
  layoutMine?: boolean;
  suggest?: boolean;
  exploded?: boolean;
  dim?: boolean;
}

export function cellSizeFor(board: Board, available: number): number {
  return Math.max(10, Math.min(34, Math.floor(available / board.width)));
}

export function drawBoard(
  canvas: HTMLCanvasElement,
  board: Board,
  size: number,
  view: (i: number) => CellView,
  pal: Palette,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = board.width * size;
  const h = board.height * size;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.grid;
  ctx.fillRect(0, 0, w, h);
  const gap = size >= 16 ? 1 : 0.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(size * 0.58)}px system-ui, sans-serif`;
  for (let i = 0; i < board.mines.length; i++) {
    const x = (i % board.width) * size;
    const y = Math.floor(i / board.width) * size;
    const v = view(i);
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.globalAlpha = v.dim ? 0.55 : 1;
    ctx.fillStyle = v.exploded ? pal.exploded : v.face === 'hidden' ? pal.hidden : v.face === 'open' ? pal.open : pal.bg;
    ctx.fillRect(x + gap, y + gap, size - 2 * gap, size - 2 * gap);
    if (v.tint) {
      ctx.fillStyle = v.tint === 'stuck' ? pal.stuck : v.tint === 'sealed' ? pal.sealed : pal.fresh;
      ctx.fillRect(x + gap, y + gap, size - 2 * gap, size - 2 * gap);
    }
    if (v.mine) {
      ctx.fillStyle = pal.mine;
      const inset = size * 0.12;
      ctx.fillRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset);
    }
    if (v.flag) {
      ctx.fillStyle = pal.layout;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.15, cy - size * 0.28);
      ctx.lineTo(cx + size * 0.25, cy - size * 0.12);
      ctx.lineTo(cx - size * 0.15, cy + 0.04 * size);
      ctx.fill();
      ctx.fillRect(cx - size * 0.17, cy - size * 0.28, Math.max(1, size * 0.06), size * 0.58);
    }
    if (v.number) {
      ctx.fillStyle = pal.numbers[v.number]!;
      ctx.fillText(String(v.number), cx, cy + 1);
    }
    if (v.layoutMine) {
      ctx.strokeStyle = pal.layout;
      ctx.lineWidth = Math.max(1.5, size * 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (v.start) {
      ctx.strokeStyle = pal.start;
      ctx.lineWidth = Math.max(2, size * 0.12);
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    }
    if (v.suggest) {
      ctx.strokeStyle = pal.suggest;
      ctx.lineWidth = Math.max(2, size * 0.12);
      ctx.setLineDash([size * 0.2, size * 0.12]);
      ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
}

/** Map a pointer event to a cell index, or -1 when off the board. */
export function cellAt(canvas: HTMLCanvasElement, board: Board, size: number, clientX: number, clientY: number): number {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) / size);
  const y = Math.floor((clientY - rect.top) / size);
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return -1;
  return y * board.width + x;
}
