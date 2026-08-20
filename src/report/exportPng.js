// Renders a shareable PNG report of the current palette analysis.
// Pure canvas drawing; no dependencies.

import { parseHex, toHex, contrastRatio, readableOn } from '../color/color.js';
import { CVD_TYPES, simulateColor } from '../color/cvd.js';
import { findConfusions } from '../color/analyze.js';

const W = 1200;
const PAD = 52;
const INK = '#16181c';
const MUTED = '#5a616c';
const LINE = '#d4d7dc';

export function exportPngReport({ colors, bgIndex, target }) {
  const hexes = colors.map((c) => c.hex);
  const rgbs = hexes.map(parseHex);
  const bgHex = hexes[bgIndex];
  const confusions = findConfusions(hexes).slice(0, 6);
  const sheetRows = 1 + CVD_TYPES.length;
  const contrastRows = hexes.length - 1;

  const HEAD_H = 96;
  const CHIP_H = 96;
  const SHEET_ROW_H = 34;
  const LIST_ROW_H = 32;
  const CONF_ROW_H = 46;
  const SEC_GAP = 34;
  const SEC_HEAD = 34;

  const H =
    PAD + HEAD_H +
    SEC_HEAD + CHIP_H + 26 + SEC_GAP +
    SEC_HEAD + sheetRows * SHEET_ROW_H + SEC_GAP +
    SEC_HEAD + contrastRows * LIST_ROW_H + SEC_GAP +
    SEC_HEAD + Math.max(1, confusions.length) * CONF_ROW_H + SEC_GAP +
    56 + PAD / 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = Math.ceil(H) * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  let y = PAD;

  // Header -----------------------------------------------------------------
  ctx.fillStyle = MUTED;
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillText('GAME PALETTE INSPECTOR · ACCESSIBILITY REPORT', PAD, y + 4);
  ctx.fillStyle = INK;
  ctx.font = '700 34px "Chakra Petch", sans-serif';
  ctx.fillText('Palette report', PAD, y + 44);
  ctx.fillStyle = MUTED;
  ctx.font = '400 13px "IBM Plex Sans", sans-serif';
  ctx.fillText(
    `${hexes.length} colors · background ${bgHex} · contrast target ${target}:1 · ${new Date().toISOString().slice(0, 10)}`,
    PAD,
    y + 70
  );
  y += HEAD_H;

  const sectionHead = (label) => {
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '600 14px "Chakra Petch", sans-serif';
    ctx.fillText(label.toUpperCase(), PAD, y + 24);
    y += SEC_HEAD;
  };

  // Palette chips ------------------------------------------------------------
  sectionHead('Palette');
  const chipW = (W - PAD * 2 - (hexes.length - 1) * 10) / hexes.length;
  hexes.forEach((hex, i) => {
    const x = PAD + i * (chipW + 10);
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, chipW, CHIP_H - 30);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(x + 0.5, y + 0.5, chipW - 1, CHIP_H - 31);
    if (i === bgIndex) {
      ctx.fillStyle = readableOn(rgbs[i]);
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillText('BG', x + 8, y + 16);
    }
    ctx.fillStyle = INK;
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.fillText(hex, x, y + CHIP_H - 10);
  });
  y += CHIP_H + 26;

  // Vision contact sheet ------------------------------------------------------
  sectionHead('Vision lab: palette through eight vision types');
  const labelW = 220;
  const rows = [
    { label: 'Typical vision', hexes },
    ...CVD_TYPES.map((t) => ({
      label: t.label,
      hexes: rgbs.map((rgb) => toHex(simulateColor(rgb, t.id))),
    })),
  ];
  for (const row of rows) {
    ctx.fillStyle = MUTED;
    ctx.font = '400 12px "IBM Plex Sans", sans-serif';
    ctx.fillText(row.label, PAD, y + SHEET_ROW_H / 2 + 4);
    const stripW = W - PAD * 2 - labelW;
    const cell = stripW / row.hexes.length;
    row.hexes.forEach((hex, i) => {
      ctx.fillStyle = hex;
      ctx.fillRect(PAD + labelW + i * cell, y + 4, cell, SHEET_ROW_H - 8);
    });
    ctx.strokeStyle = LINE;
    ctx.strokeRect(PAD + labelW + 0.5, y + 4.5, stripW - 1, SHEET_ROW_H - 9);
    y += SHEET_ROW_H;
  }
  y += 0;

  // Contrast vs background ------------------------------------------------------
  ctx.save();
  y += 0;
  ctx.restore();
  y += 0;
  sectionHead(`Contrast against background ${bgHex}`);
  hexes.forEach((hex, i) => {
    if (i === bgIndex) return;
    const ratio = contrastRatio(rgbs[i], rgbs[bgIndex]);
    const pass = ratio >= target;
    ctx.fillStyle = hex;
    ctx.fillRect(PAD, y + 6, 40, LIST_ROW_H - 12);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(PAD + 0.5, y + 6.5, 39, LIST_ROW_H - 13);
    ctx.fillStyle = INK;
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.fillText(hex, PAD + 52, y + LIST_ROW_H / 2 + 4);
    ctx.fillText(ratio.toFixed(2) + ':1', PAD + 170, y + LIST_ROW_H / 2 + 4);
    ctx.fillStyle = pass ? '#1b7a55' : '#b23c17';
    ctx.font = '600 12px "IBM Plex Sans", sans-serif';
    ctx.fillText(pass ? `✓ meets ${target}:1` : `✕ below ${target}:1`, PAD + 260, y + LIST_ROW_H / 2 + 4);
    y += LIST_ROW_H;
  });

  // Confusions ------------------------------------------------------------------
  sectionHead('Confusion report');
  if (confusions.length === 0) {
    ctx.fillStyle = '#1b7a55';
    ctx.font = '400 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('✓ Every pair stays distinguishable across all eight vision types.', PAD, y + 26);
    y += CONF_ROW_H;
  } else {
    for (const c of confusions) {
      const duo = (x, a, b) => {
        ctx.fillStyle = a;
        ctx.fillRect(x, y + 8, 26, 24);
        ctx.fillStyle = b;
        ctx.fillRect(x + 26, y + 8, 26, 24);
        ctx.strokeStyle = LINE;
        ctx.strokeRect(x + 0.5, y + 8.5, 51, 23);
      };
      duo(PAD, hexes[c.i], hexes[c.j]);
      ctx.fillStyle = MUTED;
      ctx.font = '400 13px "IBM Plex Sans", sans-serif';
      ctx.fillText('→', PAD + 62, y + 25);
      duo(PAD + 82, c.worst.a, c.worst.b);
      ctx.fillStyle = INK;
      ctx.fillText(
        `${hexes[c.i]} vs ${hexes[c.j]}: ${c.severity === 'critical' ? 'nearly identical' : 'hard to tell apart'} under ${c.worst.label.toLowerCase()} (Δ ${c.base.toFixed(2)} → ${c.worst.d.toFixed(2)})`,
        PAD + 152,
        y + 25
      );
      y += CONF_ROW_H;
    }
  }

  // Footer -----------------------------------------------------------------------
  y += 18;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = '400 11px "IBM Plex Sans", sans-serif';
  ctx.fillText(
    'Contrast: WCAG 2.x relative luminance. CVD simulation: Machado, Oliveira & Fernandes (2009), applied in linear sRGB.',
    PAD,
    y + 20
  );
  ctx.fillText(
    'Perceptual distance: OKLab (Ottosson 2020), black→white = 1.00. Simulations approximate; individual perception varies.',
    PAD,
    y + 36
  );

  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `palette-report-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}
