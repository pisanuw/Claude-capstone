import { useEffect, useRef } from 'react';
import { parseHex, toHex } from '../color/color.js';
import { CVD_TYPES, simulateColor, simulateImageData } from '../color/cvd.js';

const PREVIEW_WIDTH = 320;

function ImageTile({ image, typeId, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    const img = image.el;
    const scale = Math.min(1, PREVIEW_WIDTH / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    if (typeId !== 'normal') {
      const data = ctx.getImageData(0, 0, w, h);
      ctx.putImageData(simulateImageData(data, typeId), 0, 0);
    }
  }, [image, typeId]);
  return (
    <figure>
      <canvas ref={ref} role="img" aria-label={`Screenshot as seen with ${label}`} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function VisionLab({ colors, image }) {
  const rgbs = colors.map((c) => parseHex(c.hex));
  const rows = [
    { id: 'normal', label: 'Typical vision', note: 'reference', hexes: colors.map((c) => c.hex) },
    ...CVD_TYPES.map((t) => ({
      id: t.id,
      label: t.label,
      note: t.note,
      hexes: rgbs.map((rgb) => toHex(simulateColor(rgb, t.id))),
    })),
  ];

  return (
    <section className="section" aria-labelledby="lab-h">
      <div className="section__head">
        <h2 id="lab-h"><span className="tick">/</span>Vision lab</h2>
      </div>
      <p className="section__sub">
        A contact sheet of your palette through eight kinds of color vision, simulated with the
        physiologically-based Machado 2009 model. Colors that merge here will merge on screen.
      </p>

      <div className="contact-sheet">
        {rows.map((row) => (
          <div
            key={row.id}
            className={'contact-sheet__row' + (row.id === 'normal' ? ' contact-sheet__row--normal' : '')}
          >
            <div className="contact-sheet__label">
              <span className="contact-sheet__name">{row.label}</span>
              <span className="contact-sheet__note">{row.note}</span>
            </div>
            <div className="contact-sheet__strip" aria-label={`Palette under ${row.label}: ${row.hexes.join(', ')}`}>
              {row.hexes.map((hex, i) => (
                <span key={i} style={{ background: hex }} title={hex} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {image && (
        <div className="image-lab">
          <ImageTile image={image} typeId="normal" label="Typical vision" />
          {CVD_TYPES.map((t) => (
            <ImageTile key={t.id} image={image} typeId={t.id} label={t.label} />
          ))}
        </div>
      )}
    </section>
  );
}
