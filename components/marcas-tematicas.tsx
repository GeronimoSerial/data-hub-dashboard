/**
 * Thematic illustrations for the browse sections.
 *
 * These are illustrations, not UI icons, so they are drawn larger than the
 * 24px grid in Manual §6 — but they keep that section's language: one
 * monoline weight, rounded caps and joins, geometric construction, no
 * gradients and no shadows. Each piece carries exactly one solid colour from
 * the official palette, which is what identifies the theme; the rest of the
 * drawing takes `currentColor` so it inherits the card's ink in either theme.
 *
 * Only `Trayectorias` moves. A trajectory is a line travelled over time, so
 * drawing it is the one place where motion says something the static image
 * cannot. It runs once, and `prefers-reduced-motion` turns it off.
 */

const VIEW = '0 0 48 48'

type Props = { className?: string }

function Frame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={`marca-tematica ${className}`.trim()}
      viewBox={VIEW}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Matrícula — a nominal register: ruled rows, each standing for a student. */
export function MarcaMatricula(props: Props) {
  return (
    <Frame {...props}>
      <rect x="6" y="7" width="36" height="34" rx="2.5" />
      <path d="M6 15h36" />
      {/* The first row is filled: the enrolment being counted. */}
      <rect
        x="10.5"
        y="19.5"
        width="6"
        height="6"
        rx="1"
        fill="var(--sky-dark)"
        stroke="none"
      />
      <path d="M21 22.5h16" />
      <rect x="10.5" y="29.5" width="6" height="6" rx="1" />
      <path d="M21 32.5h11" />
    </Frame>
  )
}

/**
 * Trayectorias — a path climbing through school years, with the milestones
 * it passes. The line draws itself once on entry.
 */
export function MarcaTrayectorias(props: Props) {
  return (
    <Frame {...props}>
      <path d="M7 41V8" />
      <path d="M7 41h34" />
      <path
        className="marca-tematica__trazo"
        d="M11 34l8-7 7 5 10-14"
        pathLength={100}
      />
      <circle cx="11" cy="34" r="2.6" fill="var(--yellow)" stroke="none" />
      <circle cx="19" cy="27" r="2.6" fill="var(--yellow)" stroke="none" />
      <circle cx="26" cy="32" r="2.6" fill="var(--yellow)" stroke="none" />
      <circle cx="36" cy="18" r="2.6" fill="var(--yellow)" stroke="none" />
    </Frame>
  )
}

/** Aprendizajes — an open book, the page being read marked in Verde. */
export function MarcaAprendizajes(props: Props) {
  return (
    <Frame {...props}>
      <path d="M24 14.5v24" />
      <path d="M24 14.5C20 11 15 10 8.5 10.5v24C15 34 20 35 24 38.5" />
      <path d="M24 14.5C28 11 33 10 39.5 10.5v24C33 34 28 35 24 38.5" />
      {/* Lines of text on the right-hand page. */}
      <path d="M29 19.5h6" stroke="var(--green-dark)" />
      <path d="M29 25h6.5" stroke="var(--green-dark)" />
    </Frame>
  )
}

/** Infraestructura — school buildings, the near one roofed in Rojo. */
export function MarcaInfraestructura(props: Props) {
  return (
    <Frame {...props}>
      <path d="M6 41h36" />
      <path d="M27 41V21h13v20" />
      <path d="M31.5 27.5h4M31.5 34h4" />
      <path d="M8 41V16l10-6 9 5.5" />
      {/* The roof plane is the one solid mass in the drawing. */}
      <path d="M6.5 17.5L18 10.5l6.5 4" fill="var(--red)" stroke="none" />
      <path d="M13 41v-8h6v8" />
    </Frame>
  )
}

/** Reportes — a document, its heading block solid in Celeste. */
export function MarcaReportes(props: Props) {
  return (
    <Frame {...props}>
      <path d="M11 6.5h16.5L37 16v25.5H11z" />
      <path d="M27 6.5V16h10" />
      <rect
        x="16"
        y="21"
        width="11"
        height="4"
        rx="1"
        fill="var(--sky-dark)"
        stroke="none"
      />
      <path d="M16 30.5h16M16 35.5h11" />
    </Frame>
  )
}

/** Tableros — a monitoring panel; the tracked series is the Amarillo bar. */
export function MarcaTableros(props: Props) {
  return (
    <Frame {...props}>
      <rect x="6" y="8" width="36" height="32" rx="2.5" />
      <path d="M6 15h36" />
      <path d="M14 34v-7" />
      <rect x="20.5" y="21" width="5" height="13" rx="1" fill="var(--yellow)" stroke="none" />
      <path d="M31 34V24" />
      <path d="M37 34v-5" />
    </Frame>
  )
}

/** Mapas — territory with a located point, the marker solid in Verde. */
export function MarcaMapas(props: Props) {
  return (
    <Frame {...props}>
      <path d="M6 13l12-4 12 4 12-4v26l-12 4-12-4-12 4z" />
      <path d="M18 9v26M30 13v26" />
      <path
        d="M24 17c3.3 0 6 2.6 6 5.9 0 4.2-6 10.1-6 10.1s-6-5.9-6-10.1c0-3.3 2.7-5.9 6-5.9z"
        fill="var(--green-dark)"
        stroke="none"
      />
      <circle cx="24" cy="22.8" r="2.1" fill="var(--white)" stroke="none" />
    </Frame>
  )
}

/** Fallback for a theme added after this set was drawn. */
export function MarcaTemaGenerica(props: Props) {
  return (
    <Frame {...props}>
      <rect x="7" y="7" width="34" height="34" rx="2.5" />
      <rect x="13.5" y="13.5" width="9" height="9" rx="1" fill="var(--sky-dark)" stroke="none" />
      <rect x="25.5" y="13.5" width="9" height="9" rx="1" />
      <rect x="13.5" y="25.5" width="9" height="9" rx="1" />
      <rect x="25.5" y="25.5" width="9" height="9" rx="1" />
    </Frame>
  )
}

export const MARCA_TEMA: Record<string, (props: Props) => React.JSX.Element> = {
  matricula: MarcaMatricula,
  trayectorias: MarcaTrayectorias,
  aprendizajes: MarcaAprendizajes,
  infraestructura: MarcaInfraestructura,
}

export const MARCA_FORMATO = {
  reporte: MarcaReportes,
  tablero: MarcaTableros,
  mapa: MarcaMapas,
} as const
