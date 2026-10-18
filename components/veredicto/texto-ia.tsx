'use client'

import { useEffect, useState, type JSX } from 'react'

/** Total time budget for typing a whole verdict. */
const DURACION_MAX_MS = 1200
/** Upper bound per word, so short texts do not feel sluggish. */
const PASO_MAX_MS = 35

export function contarPalabras(textos: string[]): number {
  return textos.reduce((total, t) => total + t.split(/\s+/).filter(Boolean).length, 0)
}

/** Per-word delay that keeps `palabras` words within the typing budget. */
export function pasoEscritura(palabras: number): number {
  if (palabras <= 0) return PASO_MAX_MS
  return Math.min(PASO_MAX_MS, Math.floor(DURACION_MAX_MS / palabras))
}

function prefiereMovimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * True while the typing animation runs. Starts on mount only, so it plays
 * once per mount (each modal open), not on every re-render.
 */
export function useEscribiendo(duracionMs: number): boolean {
  const [escribiendo, setEscribiendo] = useState(() => !prefiereMovimientoReducido())
  useEffect(() => {
    if (!escribiendo) return
    const id = window.setTimeout(() => setEscribiendo(false), duracionMs)
    return () => window.clearTimeout(id)
    // Mount-only on purpose: a new duration must not restart the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return escribiendo
}

/**
 * Text that fades in word by word. The animated copy is aria-hidden and the
 * full text is always available to assistive tech. Reduced motion is handled
 * in CSS (words render visible with no animation).
 */
export function TextoIA({
  texto,
  inicio = 0,
  paso = PASO_MAX_MS,
}: {
  texto: string
  /** Index of this text's first word within the whole animated block. */
  inicio?: number
  paso?: number
}): JSX.Element {
  const palabras = texto.split(/\s+/).filter(Boolean)
  return (
    <span className="texto-ia">
      <span className="sr-only">{texto}</span>
      <span aria-hidden="true">
        {palabras.map((palabra, i) => (
          <span key={i} className="texto-ia__palabra" style={{ animationDelay: `${(inicio + i) * paso}ms` }}>
            {palabra}
            {i < palabras.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </span>
  )
}
