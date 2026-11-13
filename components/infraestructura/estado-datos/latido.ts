// "Latido" de una fuente: las corridas de las últimas 72 h dibujadas como un
// electrocardiograma. Lógica pura (sin React): convierte corridas en marcas
// (latido = corrida exitosa, falla = corrida fallida), una etiqueta de texto y
// el trazo SVG. El texto es siempre la señal principal; el trazo la refuerza.

export const VENTANA_LATIDO_HORAS = 72
const HORA_MS = 3_600_000

export type CorridaLatido = { en: string; ok: boolean }
export type MarcaLatido = { pos: number; tipo: 'latido' | 'falla' }
export type EtiquetaLatido =
  | { clave: 'viva' }
  | { clave: 'intermitente' }
  | { clave: 'sinLatido'; dias: number }
  | { clave: 'nunca' }

export type Latido = {
  marcas: MarcaLatido[]
  etiqueta: EtiquetaLatido
  completadas: number
  fallidas: number
}

export function construirLatido(params: {
  // null: la fuente no tiene historial de corridas (sólo se conoce el último éxito).
  corridas: CorridaLatido[] | null
  ahora: string
  ultimoExitoEn: string | null
  intervaloMinutos: number | null
}): Latido {
  const ahoraMs = Date.parse(params.ahora)
  const desdeMs = ahoraMs - VENTANA_LATIDO_HORAS * HORA_MS
  const ventanaMs = ahoraMs - desdeMs
  const enRango = (lista: CorridaLatido[]) =>
    lista
      .map((c) => ({ ...c, ms: Date.parse(c.en) }))
      .filter((c) => Number.isFinite(c.ms) && c.ms >= desdeMs && c.ms <= ahoraMs)
      .sort((a, b) => a.ms - b.ms)
  let enVentana = enRango(params.corridas ?? [])
  // Sin historial en la ventana, el único dato es el último éxito: un solo
  // latido, y la etiqueta sale de su frescura (no hay huecos que medir).
  const soloUltimoExito = enVentana.length === 0 && params.ultimoExitoEn !== null
  if (soloUltimoExito) enVentana = enRango([{ en: params.ultimoExitoEn as string, ok: true }])

  const marcas = enVentana.map((c) => ({ pos: (c.ms - desdeMs) / ventanaMs, tipo: c.ok ? ('latido' as const) : ('falla' as const) }))
  const latidosMs = enVentana.filter((c) => c.ok).map((c) => c.ms)
  const completadas = latidosMs.length
  const fallidas = enVentana.length - completadas

  let etiqueta: EtiquetaLatido
  if (completadas === 0) {
    const exitoMs = params.ultimoExitoEn === null ? NaN : Date.parse(params.ultimoExitoEn)
    etiqueta = Number.isFinite(exitoMs)
      ? { clave: 'sinLatido', dias: Math.max(1, Math.round((ahoraMs - exitoMs) / (24 * HORA_MS))) }
      : { clave: 'nunca' }
  } else {
    const tolerancia = 2 * (params.intervaloMinutos ?? 24 * 60) * 60_000
    const puntos = soloUltimoExito ? [latidosMs[0]!, ahoraMs] : [desdeMs, ...latidosMs, ahoraMs]
    const hayHueco = puntos.some((p, i) => i > 0 && p - puntos[i - 1]! > tolerancia)
    etiqueta = hayHueco ? { clave: 'intermitente' } : { clave: 'viva' }
  }
  return { marcas, etiqueta, completadas, fallidas }
}

const BASE_Y = 16
const MARGEN = 7

export function trazoLatido(marcas: MarcaLatido[], ancho: number): { base: string; latidos: string; fallas: string } {
  const x = (pos: number) => Math.min(ancho - MARGEN, Math.max(MARGEN, Math.round(pos * ancho * 10) / 10))
  const latidos = marcas
    .filter((m) => m.tipo === 'latido')
    .map((m) => {
      const c = x(m.pos)
      return `M${c - 6} ${BASE_Y} L${c - 4} 13 L${c - 2} ${BASE_Y} L${c - 1} 3 L${c + 1} 22 L${c + 3} ${BASE_Y} L${c + 6} ${BASE_Y}`
    })
    .join(' ')
  const fallas = marcas
    .filter((m) => m.tipo === 'falla')
    .map((m) => {
      const c = x(m.pos)
      return `M${c - 3} ${BASE_Y} L${c} 22 L${c + 3} ${BASE_Y}`
    })
    .join(' ')
  return { base: `M0 ${BASE_Y} H${ancho}`, latidos, fallas }
}
