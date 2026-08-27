import { findConfusions } from '../color/analyze.js';

export default function ConfusionPanel({ colors }) {
  const hexes = colors.map((c) => c.hex);
  const confusions = findConfusions(hexes);

  return (
    <section className="section" aria-labelledby="confusion-h">
      <div className="section__head">
        <h2 id="confusion-h"><span className="tick">/</span>Confusion report</h2>
      </div>
      <p className="section__sub">
        Pairs that look clearly different to you but collapse for some players. Distance is
        measured perceptually (OKLab, where black to white is 1.00): under 0.10 is easy to mix
        up mid-game, under 0.04 reads as the same color. Give any flagged pair a second channel
        (a shape, icon, outline, or lightness step) instead of relying on hue.
      </p>

      {confusions.length === 0 ? (
        <div className="empty">
          <span className="mark">✓</span>
          Every pair in this palette stays distinguishable across all eight simulated vision types.
        </div>
      ) : (
        confusions.map((c) => (
          <div className="finding" key={`${c.i}-${c.j}`}>
            <div className="pairbox" aria-hidden="true">
              <span className="pairbox__duo">
                <i style={{ background: hexes[c.i] }} />
                <i style={{ background: hexes[c.j] }} />
              </span>
              <span className="pairbox__arrow">→</span>
              <span className="pairbox__duo">
                <i style={{ background: c.worst.a }} />
                <i style={{ background: c.worst.b }} />
              </span>
            </div>
            <div className="finding__text">
              <code>{hexes[c.i]}</code> and <code>{hexes[c.j]}</code> become{' '}
              {c.severity === 'critical' ? <strong>nearly identical</strong> : <strong>hard to tell apart</strong>}{' '}
              under <strong>{c.worst.label.toLowerCase()}</strong>: perceptual distance drops
              from {c.base.toFixed(2)} to {c.worst.d.toFixed(2)}.
            </div>
            <span className={'tag tag--' + c.severity}>{c.severity}</span>
          </div>
        ))
      )}
    </section>
  );
}
