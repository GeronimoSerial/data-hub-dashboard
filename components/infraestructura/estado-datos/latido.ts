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
  | { clave: 'falla' }
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
  ultimoIntentoEn: string | null
  intervaloMinutos: number | null
  // Estado del item: 'fallido' marca que el ÚLTIMO intento falló aunque no haya historial.
  estado: string
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
  // Sin historial en la ventana, los únicos datos son el último éxito y el
  // último intento: un latido (y, si el item falló, una muesca).
  const sinHistorial = enVentana.length === 0
  if (sinHistorial) {
    const conocidas: CorridaLatido[] = []
    if (params.ultimoExitoEn !== null) conocidas.push({ en: params.ultimoExitoEn, ok: true })
    if (params.estado === 'fallido' && params.ultimoIntentoEn !== null) conocidas.push({ en: params.ultimoIntentoEn, ok: false })
    enVentana = enRango(conocidas)
  }

  const marcas = enVentana.map((c) => ({ pos: (c.ms - desdeMs) / ventanaMs, tipo: c.ok ? ('latido' as const) : ('falla' as const) }))
  const latidosMs = enVentana.filter((c) => c.ok).map((c) => c.ms)
  const completadas = latidosMs.length
  const fallidas = enVentana.length - completadas
  // La etiqueta sale primero del ÚLTIMO intento: si falló, nunca es "viva".
  const ultimoFallo = sinHistorial ? params.estado === 'fallido' : enVentana[enVentana.length - 1]!.ok === false

  let etiqueta: EtiquetaLatido
  if (completadas === 0) {
    const exitoMs = params.ultimoExitoEn === null ? NaN : Date.parse(params.ultimoExitoEn)
    etiqueta = ultimoFallo
      ? { clave: 'falla' }
      : Number.isFinite(exitoMs)
        ? { clave: 'sinLatido', dias: Math.max(1, Math.round((ahoraMs - exitoMs) / (24 * HORA_MS))) }
        : { clave: 'nunca' }
  } else if (ultimoFallo) {
    etiqueta = { clave: 'intermitente' }
  } else {
    const tolerancia = 2 * (params.intervaloMinutos ?? 24 * 60) * 60_000
    const puntos = sinHistorial ? [latidosMs[0]!, ahoraMs] : [desdeMs, ...latidosMs, ahoraMs]
    const hayHueco = puntos.some((p, i) => i > 0 && p - puntos[i - 1]! > tolerancia)
    etiqueta = hayHueco ? { clave: 'intermitente' } : { clave: 'viva' }
  }
  return { marcas, etiqueta, completadas, fallidas }
}

const MARGEN = 8

// Trazo ECG en un lienzo de `ancho` x `alto`: línea base al 70 % de la altura,
// pico alto en cada latido y muesca hacia abajo en cada corrida fallida.
export function trazoLatido(
  marcas: MarcaLatido[],
  ancho: number,
  alto: number = 30,
): { base: string; latidos: string; fallas: string } {
  const r = (n: number) => Math.round(n * 10) / 10
  const base = r(alto * 0.7)
  const x = (pos: number) => Math.min(ancho - MARGEN, Math.max(MARGEN, r(pos * ancho)))
  const latidos = marcas
    .filter((m) => m.tipo === 'latido')
    .map((m) => {
      const c = x(m.pos)
      return `M${c - 7} ${base} L${c - 4} ${r(alto * 0.5)} L${c - 2} ${base} L${c - 1} ${r(alto * 0.06)} L${c + 1} ${r(alto * 0.94)} L${c + 3} ${base} L${c + 7} ${base}`
    })
    .join(' ')
  const fallas = marcas
    .filter((m) => m.tipo === 'falla')
    .map((m) => {
      const c = x(m.pos)
      return `M${c - 4} ${base} L${c} ${r(alto * 0.94)} L${c + 4} ${base}`
    })
    .join(' ')
  return { base: `M0 ${base} H${ancho}`, latidos, fallas }
}
