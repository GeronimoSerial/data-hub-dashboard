/**
 * Institutional signature — Manual de Marca Gobierno de Corrientes V1.1, §2.
 *
 * The official files under `public/marca/` are served as supplied. They are
 * never recoloured, rebuilt from a substitute typeface, or scaled below the
 * minimums in §2.3: 60px for the horizontal signature, 40px for the isotipo.
 * Those heights are set in CSS (`.app-signature__mark`, `.app-signature__shield`).
 *
 * `<img>` rather than `next/image`: these are SVGs, which next/image refuses
 * to optimise unless `dangerouslyAllowSVG` is enabled, and rasterising a
 * vector signature would defeat the point. Rendering them as external images
 * also keeps their internal `.cls-*` styles from colliding with the page, so
 * nothing on our side can recolour the mark by accident.
 */

const ALT = 'Gobierno de Corrientes · Ministerio de Educación'

/** Horizontal signature, application 1. Colour on light surfaces. */
export function MarcaHorizontal({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`app-signature__mark ${className}`.trim()}
      src="/marca/logo-educacion-h.svg"
      alt={ALT}
      width={1051}
      height={208}
    />
  )
}

/** The same signature prepared for dark surfaces (§2.1). Decorative: the
 *  light variant alongside it already carries the accessible name. */
export function MarcaHorizontalInversa() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="app-signature__mark app-signature__mark--inv"
      src="/marca/logo-educacion-h-inv.svg"
      alt=""
      width={1051}
      height={208}
      aria-hidden
    />
  )
}

/**
 * Compact lockup for widths where the horizontal signature cannot be shown
 * at its 60px minimum: the isotipo at its own 40px minimum, beside the
 * ministry denomination in Montserrat Bold — the pairing §4.4 specifies for
 * a ministry name sitting with the Gobierno de Corrientes mark.
 */
export function MarcaCompacta() {
  return (
    <span className="app-signature__compact">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="app-signature__shield"
        src="/marca/escudo.svg"
        alt="Escudo de la Provincia de Corrientes"
        width={516}
        height={726}
      />
      <span className="app-signature__denomination">
        Ministerio de
        <br />
        Educación
      </span>
    </span>
  )
}
