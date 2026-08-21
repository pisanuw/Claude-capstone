// Draws a small synthetic "app screenshot" pair on canvases so the tool can
// be tried without hunting for two screenshots. The second frame contains one
// example of every change type the classifier knows.

function drawBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f4f6fb';
  ctx.fillRect(0, 0, 640, 420);
  // sidebar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 150, 420);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ['Dashboard', 'Reports', 'Settings', 'Billing'].forEach((label, i) => {
    ctx.fillText(label, 32, 70 + i * 34);
  });
  // header bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(150, 0, 490, 52);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Quarterly overview', 174, 32);
}

export function drawSampleBefore(ctx: CanvasRenderingContext2D): void {
  drawBase(ctx);
  // primary button (will change color)
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(500, 14, 116, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('Export data', 522, 31);
  // card (will move down-right)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(180, 80, 180, 100);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(180.5, 80.5, 179, 99);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('$48,200', 196, 122);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('Revenue this quarter', 196, 150);
  // paragraph (text will be edited)
  ctx.fillStyle = '#334155';
  ctx.font = '13px sans-serif';
  ctx.fillText('Growth is on track across all regions.', 180, 230);
  ctx.fillText('The EMEA pipeline doubled since March.', 180, 250);
  // pill (will fade)
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(180, 290, 90, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ON TARGET', 192, 305);
  // icon block (will be removed)
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(560, 340, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('!', 556, 347);
  // nav highlight (will nudge right: spacing)
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(12, 96, 4, 18);
}

export function drawSampleAfter(ctx: CanvasRenderingContext2D): void {
  drawBase(ctx);
  // color change: same button, new palette
  ctx.fillStyle = '#9333ea';
  ctx.fillRect(500, 14, 116, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('Export data', 522, 31);
  // layout: card moved 24px right, 20px down
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(204, 100, 180, 100);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(204.5, 100.5, 179, 99);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('$48,200', 220, 142);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('Revenue this quarter', 220, 170);
  // text edit: second line rewritten
  ctx.fillStyle = '#334155';
  ctx.font = '13px sans-serif';
  ctx.fillText('Growth is on track across all regions.', 180, 230);
  ctx.fillText('APAC bookings tripled since January.', 180, 250);
  // visibility: pill at 35% opacity
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(180, 290, 90, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ON TARGET', 192, 305);
  ctx.globalAlpha = 1;
  // removed: no warning icon
  // added: new banner
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(400, 90, 210, 40);
  ctx.fillStyle = '#1d4ed8';
  ctx.font = '12px sans-serif';
  ctx.fillText('New: weekly digest emails', 416, 114);
  // spacing: nav highlight nudged 8px right
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(20, 96, 4, 18);
}

export const SAMPLE_SIZE = { width: 640, height: 420 };
