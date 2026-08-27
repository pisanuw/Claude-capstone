import { useRef, useState } from 'react';
import { parseHex, toHex, readableOn } from '../color/color.js';
import { extractPalette } from '../color/extract.js';

export const PRESETS = [
  {
    name: 'Forest platformer',
    bg: 0,
    hexes: ['#1b2a20', '#3e8948', '#d95763', '#f4d35e', '#4e91d9', '#8a6f4d', '#e8e3d3'],
  },
  {
    name: 'Neon arcade',
    bg: 0,
    hexes: ['#0d0221', '#ff2975', '#00f0ff', '#ffd400', '#7a04eb', '#f8f8f2'],
  },
  {
    name: 'Red/green trap',
    bg: 0,
    hexes: ['#262626', '#e74c3c', '#27ae60', '#f1c40f', '#ecf0f1'],
  },
];

export const MAX_COLORS = 12;

function Chip({ color, isBg, onChangeHex, onSetBg, onRemove, canRemove }) {
  const [draft, setDraft] = useState(null); // null = follow color.hex
  const value = draft ?? color.hex;
  const valid = parseHex(value) !== null;

  function commit() {
    const rgb = parseHex(value);
    if (rgb) onChangeHex(toHex(rgb));
    setDraft(null);
  }

  const labelColor = readableOn(parseHex(color.hex));

  return (
    <div className="chip">
      <label className="chip__swatch" style={{ background: color.hex }} title="Pick a color">
        {isBg && (
          <span
            className="chip__bg-tag"
            style={{ color: labelColor, border: `1px solid ${labelColor}` }}
          >
            BG
          </span>
        )}
        <input
          type="color"
          value={color.hex}
          onChange={(e) => onChangeHex(e.target.value)}
          aria-label={`Pick color, currently ${color.hex}`}
        />
      </label>
      <div className="chip__meta">
        <input
          className={'chip__hex' + (valid ? '' : ' chip__hex--invalid')}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Hex value"
          spellCheck={false}
        />
        <div className="chip__row">
          <button
            className={'chip__action' + (isBg ? ' chip__action--on' : '')}
            onClick={onSetBg}
            title="Contrast is measured against the background color"
            aria-pressed={isBg}
          >
            {isBg ? '● BG' : '○ BG'}
          </button>
          {canRemove && (
            <button
              className="chip__action"
              onClick={onRemove}
              title={`Remove ${color.hex}`}
              aria-label={`Remove ${color.hex}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaletteBench({ colors, bgIndex, image, dispatch }) {
  const [newHex, setNewHex] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  function addColor(hex) {
    const rgb = parseHex(hex);
    if (!rgb || colors.length >= MAX_COLORS) return;
    dispatch({ type: 'add', hex: toHex(rgb) });
    setNewHex('');
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const hexes = extractPalette(img, 8);
      dispatch({ type: 'loadImage', image: { el: img, url, name: file.name }, hexes });
    };
    img.src = url;
  }

  const newValid = parseHex(newHex) !== null;

  return (
    <section className="section" aria-labelledby="bench-h">
      <div className="section__head">
        <h2 id="bench-h"><span className="tick">/</span>Bench</h2>
      </div>
      <p className="section__sub">
        Your working palette. Click a swatch to adjust it, edit the hex directly, and mark
        one color as the background everything else sits on.
      </p>

      <div className="bench">
        {colors.map((c, i) => (
          <Chip
            key={c.id}
            color={c}
            isBg={i === bgIndex}
            canRemove={colors.length > 2}
            onChangeHex={(hex) => dispatch({ type: 'edit', id: c.id, hex })}
            onSetBg={() => dispatch({ type: 'setBg', index: i })}
            onRemove={() => dispatch({ type: 'remove', id: c.id })}
          />
        ))}
        {colors.length < MAX_COLORS && (
          <div className="bench-add">
            <input
              className={'field' + (newHex && !newValid ? ' field--invalid' : '')}
              placeholder="#hex"
              value={newHex}
              onChange={(e) => setNewHex(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColor(newHex)}
              aria-label="New color hex value"
              spellCheck={false}
            />
            <button className="btn btn--small" onClick={() => addColor(newHex)} disabled={!newValid}>
              Add color
            </button>
          </div>
        )}
      </div>

      <div className="bench-tools">
        <span className="bench-tools__label">Try a palette</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="btn btn--small btn--ghost"
            onClick={() => dispatch({ type: 'preset', preset: p })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div
        className={'dropzone' + (dragOver ? ' dropzone--over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          loadFile(e.dataTransfer.files[0]);
        }}
      >
        {image ? (
          <img className="dropzone__thumb" src={image.url} alt={`Loaded screenshot: ${image.name}`} />
        ) : null}
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong style={{ color: 'var(--text)' }}>
            {image ? image.name : 'Drop a game screenshot'}
          </strong>
          <div>
            {image
              ? 'Palette extracted from the 8 dominant colors. The Vision Lab below shows the full frame through each vision type.'
              : 'The 8 dominant colors become your palette, and the whole frame gets simulated below.'}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => loadFile(e.target.files[0])}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {image ? 'Replace image' : 'Choose image'}
        </button>
        {image && (
          <button className="btn btn--ghost" onClick={() => dispatch({ type: 'clearImage' })}>
            Remove
          </button>
        )}
      </div>
    </section>
  );
}
