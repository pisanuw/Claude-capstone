import { useState } from 'react';
import type { Report } from '../lib/types.js';

const SAMPLE_TEXT =
  'Office hours are Tuesdays at 2pm. Submit your assignment through the course portal before Friday.';

/** Low-vision: toggle a blur + zoom treatment over sample text so a sighted
 *  user feels the effort of reading at reduced acuity. */
export function LowVisionSim(): JSX.Element {
  const [blur, setBlur] = useState(true);
  const [zoom, setZoom] = useState(1);
  return (
    <div>
      <p className="mb-4 text-ink">
        Low-vision users often run the page at 200% zoom and still see softened edges. Toggle the
        treatments to feel the difference.
      </p>
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} />
          <span>Reduced acuity (blur)</span>
        </label>
        <label className="flex items-center gap-2">
          Zoom
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom level"
          />
          <span className="font-mono text-sm">{Math.round(zoom * 100)}%</span>
        </label>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-paper p-6">
        <p
          className={blur ? 'lv-blur' : ''}
          style={{ fontSize: `${zoom}rem`, lineHeight: 1.5, transition: 'font-size 120ms' }}
        >
          {SAMPLE_TEXT}
        </p>
      </div>
    </div>
  );
}

const SWATCHES = [
  { name: 'Success green', hex: '#1f9d55' },
  { name: 'Error red', hex: '#d64545' },
  { name: 'Info blue', hex: '#3b82c4' },
  { name: 'Warning amber', hex: '#d99a1c' },
];

const CB_TYPES = [
  { id: '', label: 'Typical vision' },
  { id: 'cb-deuteranopia', label: 'Deuteranopia (red-green)' },
  { id: 'cb-protanopia', label: 'Protanopia (red-green)' },
  { id: 'cb-tritanopia', label: 'Tritanopia (blue-yellow)' },
];

/** Color-blindness: apply SVG filters to a typical status palette so the user
 *  sees red/green collapse together. */
export function ColorBlindnessSim(): JSX.Element {
  const [type, setType] = useState('cb-deuteranopia');
  return (
    <div>
      <p className="mb-4 text-ink">
        About 1 in 12 men cannot reliably tell these status colors apart. Switch the simulation and
        watch "success" and "error" converge, which is why color must never be the only signal.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CB_TYPES.map((t) => (
          <button
            key={t.id || 'none'}
            type="button"
            onClick={() => setType(t.id)}
            aria-pressed={type === t.id}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              type === t.id
                ? 'border-accent bg-accent text-panel'
                : 'border-line bg-panel text-ink hover:border-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${type}`}>
        {SWATCHES.map((s) => (
          <div key={s.name} className="rounded-lg border border-line bg-paper p-2 text-center">
            <div className="mb-2 h-16 rounded" style={{ backgroundColor: s.hex }} />
            <p className="text-xs text-ink">{s.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Keyboard-only: list the tab-order issues, and reinforce the mental model. */
export function KeyboardSim({ report }: { report: Report }): JSX.Element {
  const kbIssues = report.issues.filter((i) => i.profiles.includes('keyboard-only'));
  return (
    <div>
      <p className="mb-4 text-ink">
        Keyboard users move with Tab, Shift+Tab, and Enter, in DOM order. They depend on a visible
        focus ring and a predictable sequence. Anything reachable only by mouse is invisible to them.
      </p>
      {kbIssues.length === 0 ? (
        <p className="rounded-lg border border-line bg-paper p-4 text-ink">
          No keyboard-specific issues were detected. Tab through the real page to confirm every
          control is reachable and shows a focus ring.
        </p>
      ) : (
        <ul className="space-y-2">
          {kbIssues.map((i, idx) => (
            <li key={idx} className="rounded-lg border border-line bg-paper p-3 text-ink">
              <span className="font-semibold">{i.title}</span> at{' '}
              <span className="font-mono text-sm">{i.selector}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
