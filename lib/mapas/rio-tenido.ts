// Tinted river: the Paraná and the Uruguay take the height state of the nearest
// station on the same river. Each station owns the cell of points closer to it
// than to its neighbours on that river (boundaries at the midpoints), and the
// basemap's `waterway` class=river lines are coloured with `within` per cell.

import { PALETA_ESTADO_ALTURA } from './paleta-tonal'

export type EstadoAlturaRio = keyof typeof PALETA_ESTADO_ALTURA
export type RioTenido = 'parana' | 'uruguay'

export type EstacionTenido = {
  rio: RioTenido
  lat: number
  lon: number
  estado: EstadoAlturaRio
  lectura: unknown | null
  lecturaVencida: boolean
}

export type CeldaRio = {
  rio: RioTenido
  estado: EstadoAlturaRio
  poligono: { type: 'Polygon'; coordinates: number[][][] }
}

type Punto = [number, number]

/** Margin (degrees) around the stations so every cell spans the whole river course. */
const MARGEN_GRADOS = 3

/** OSM names as they come in OpenMapTiles (`name`), matched by substring. */
export const NOMBRE_RIO: Record<RioTenido, string> = { parana: 'Paraná', uruguay: 'Uruguay' }

/** Stale (>18 h) or missing readings paint as sin dato. */
export function estadoTenido(estacion: EstacionTenido): EstadoAlturaRio {
  if (!estacion.lectura || estacion.lecturaVencida) return 'sin_dato'
  return estacion.estado
}

// Keeps the side of the bisector between `a` and `b` that contains `a`
// (Sutherland–Hodgman against one half-plane).
function recortarMitad(poligono: Punto[], a: Punto, b: Punto): Punto[] {
  const nx = b[0] - a[0]
  const ny = b[1] - a[1]
  const c = (nx * (a[0] + b[0])) / 2 + (ny * (a[1] + b[1])) / 2
  const lado = (p: Punto) => nx * p[0] + ny * p[1] - c
  const salida: Punto[] = []
  for (let i = 0; i < poligono.length; i++) {
    const p = poligono[i]
    const q = poligono[(i + 1) % poligono.length]
    const lp = lado(p)
    const lq = lado(q)
    if (lp <= 0) salida.push(p)
    if ((lp < 0 && lq > 0) || (lp > 0 && lq < 0)) {
      const t = lp / (lp - lq)
      salida.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return salida
}

/** One cell per station with coordinates, per river. */
export function celdasRio(estaciones: EstacionTenido[]): CeldaRio[] {
  const celdas: CeldaRio[] = []
  for (const rio of Object.keys(NOMBRE_RIO) as RioTenido[]) {
    const delRio = estaciones.filter((e) => e.rio === rio && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    if (!delRio.length) continue
    // Work in locally equal-area units so the bisectors are true midpoints on the ground.
    const latMedia = delRio.reduce((s, e) => s + e.lat, 0) / delRio.length
    const k = Math.cos((latMedia * Math.PI) / 180)
    const aPlano = (e: { lat: number; lon: number }): Punto => [e.lon * k, e.lat]
    const lons = delRio.map((e) => e.lon)
    const lats = delRio.map((e) => e.lat)
    const [x0, x1] = [(Math.min(...lons) - MARGEN_GRADOS) * k, (Math.max(...lons) + MARGEN_GRADOS) * k]
    const [y0, y1] = [Math.min(...lats) - MARGEN_GRADOS, Math.max(...lats) + MARGEN_GRADOS]
    for (const estacion of delRio) {
      let celda: Punto[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      const propia = aPlano(estacion)
      for (const otra of delRio) {
        if (otra === estacion) continue
        const ajena = aPlano(otra)
        if (ajena[0] === propia[0] && ajena[1] === propia[1]) continue
        celda = recortarMitad(celda, propia, ajena)
      }
      if (celda.length < 3) continue
      const anillo = celda.map(([x, y]) => [x / k, y])
      anillo.push(anillo[0])
      celdas.push({ rio, estado: estadoTenido(estacion), poligono: { type: 'Polygon', coordinates: [anillo] } })
    }
  }
  return celdas
}

const TRANSPARENTE = 'rgba(0,0,0,0)'

/** `line-color` for the river band: first matching cell wins, else transparent. */
export function colorRioTenido(celdas: CeldaRio[]): unknown {
  if (!celdas.length) return TRANSPARENTE
  const ramas = celdas.flatMap((celda) => [
    ['all', ['in', NOMBRE_RIO[celda.rio], ['coalesce', ['get', 'name'], '']], ['within', celda.poligono]],
    PALETA_ESTADO_ALTURA[celda.estado],
  ])
  return ['case', ...ramas, TRANSPARENTE]
}

export const FILTRO_RIO_TENIDO = ['==', ['get', 'class'], 'river'] as const
export const ANCHO_RIO_TENIDO = ['interpolate', ['linear'], ['zoom'], 5, 3, 9, 8, 13, 22, 16, 40] as const
