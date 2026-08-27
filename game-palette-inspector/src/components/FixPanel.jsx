import { parseHex, contrastRatio } from '../color/color.js';
import { suggestFix } from '../color/analyze.js';

export default function FixPanel({ colors, bgIndex, target, dispatch }) {
  const bg = colors[bgIndex];
  const rows = colors
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => i !== bgIndex)
    .map(({ c, i }) => {
      const ratio = contrastRatio(parseHex(c.hex), parseHex(bg.hex));
      const passes = ratio >= target;
      const fix = passes ? null : suggestFix(c.hex, bg.hex, target);
      return { c, i, ratio, passes, fix };
    });

  const failing = rows.filter((r) => !r.passes);
  const fixable = failing.filter((r) => r.fix);

  function applyAll() {
    for (const r of fixable) {
      dispatch({ type: 'edit', id: r.c.id, hex: r.fix.hex });
    }
  }

  return (
    <section className="section" aria-labelledby="fix-h">
      <div className="section__head">
        <h2 id="fix-h"><span className="tick">/</span>Fix studio</h2>
        {fixable.length > 1 && (
          <button className="btn btn--primary" onClick={applyAll}>
            Apply all {fixable.length} fixes
          </button>
        )}
      </div>
      <p className="section__sub">
        Replacements that reach {target}:1 against the background <code style={{ fontFamily: 'var(--mono)' }}>{bg.hex}</code> by
        shifting only lightness: same hue, so your art direction survives the fix.
      </p>

      {failing.length === 0 ? (
        <div className="empty">
          <span className="mark">✓</span>
          Every color already meets {target}:1 against the background. Nothing to fix.
        </div>
      ) : (
        failing.map((r) =>
          r.fix ? (
            <div className="finding" key={r.c.id}>
              <div className="fix-swap" aria-hidden="true">
                <i style={{ background: r.c.hex }} />
                <span className="pairbox__arrow">→</span>
                <i style={{ background: r.fix.hex }} />
              </div>
              <div className="finding__text">
                <code>{r.c.hex}</code> reads {r.ratio.toFixed(2)}:1 on the background. Nudged{' '}
                <strong>{r.fix.direction}</strong> to <code>{r.fix.hex}</code> it reaches{' '}
                <strong>{r.fix.ratio.toFixed(2)}:1</strong>.
              </div>
              <button
                className="btn btn--small"
                onClick={() => dispatch({ type: 'edit', id: r.c.id, hex: r.fix.hex })}
              >
                Apply
              </button>
            </div>
          ) : (
            <div className="finding" key={r.c.id}>
              <div className="fix-swap" aria-hidden="true">
                <i style={{ background: r.c.hex }} />
              </div>
              <div className="finding__text">
                <code>{r.c.hex}</code> reads {r.ratio.toFixed(2)}:1, and no lightness of this hue
                can reach {target}:1 against <code>{bg.hex}</code>: the background is too close to
                the mid-tones. Lighten or darken the background, or use the 4.5:1 target.
              </div>
              <span className="tag tag--critical">no fix at {target}:1</span>
            </div>
          )
        )
      )}
    </section>
  );
}
