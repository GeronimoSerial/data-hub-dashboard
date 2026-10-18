// Lógica pura de la climatología diaria IMERG: periodos, búsqueda CMR por mes,
// subset OPeNDAP ASCII y parseo de la respuesta a celdas. No hace red ni
// persiste; el orquestador que la usa vive en una tarea posterior.
import { z } from 'zod'
import { celdaDeCoordenada } from '../celda'
import {
  IMERG_LAT_MAX,
  IMERG_LAT_MIN,
  IMERG_LON_MAX,
  IMERG_LON_MIN,
  calcularIndicesGrillaImerg,
} from './imerg'

export const VERSION_CLIMATOLOGIA_IMERG = 'climatologia-imerg-v1'

/**
 * Versión con la que se guardan los umbrales de un período concreto, p. ej.
 * `climatologia-imerg-v1-2001-2014`. El período crece a medida que se bajan
 * años; con una versión única el reductor del motor (agrupa por versión, ver
 * motor/adaptadores/lluvia.ts) mezclaba percentiles de períodos distintos.
 * Conserva el prefijo `climatologia-imerg` que usan los lectores.
 */
export function versionUmbralesImerg(periodoDesde: string, periodoHasta: string): string {
  return `${VERSION_CLIMATOLOGIA_IMERG}-${periodoDesde.slice(0, 4)}-${periodoHasta.slice(0, 4)}`
}
export const ANIO_INICIO_IMERG = 2001
export const PREFIJO_SERIE_IMERG = 'imerg:'

export function claveSerieImerg(geometryRef: string): string {
  return `${PREFIJO_SERIE_IMERG}${geometryRef}`
}

// IMERG Final tiene ~3.5 meses de latencia: desde mayo se asume disponible el
// año anterior completo; antes de mayo, hasta dos años atrás.
export function periodoClimatologiaImerg(ahora: Date): {
  periodoDesde: string
  periodoHasta: string
} {
  const mesUtc = ahora.getUTCMonth()
  const anioHasta = ahora.getUTCFullYear() - (mesUtc >= 4 ? 1 : 2)
  return {
    periodoDesde: `${ANIO_INICIO_IMERG}-01-01`,
    periodoHasta: `${anioHasta}-12-31`,
  }
}

// ---------------------------------------------------------------------------
// Búsqueda de gránulos diarios (CMR, JSON)
// ---------------------------------------------------------------------------

export type GranuloDiarioImerg = { fecha: string; urlOpendap: string }

const PREFIJO_OPENDAP = 'https://opendap.earthdata.nasa.gov/'

const cmrDiarioSchema = z.object({
  feed: z.object({
    entry: z.array(
      z.object({
        time_start: z.string(),
        links: z.array(z.object({ href: z.string() })),
      }),
    ),
  }),
})

export function listarGranulosDiarios(cmrJson: unknown): GranuloDiarioImerg[] {
  const parseado = cmrDiarioSchema.safeParse(cmrJson)
  if (!parseado.success) return []

  const granulos: GranuloDiarioImerg[] = []
  for (const entry of parseado.data.feed.entry) {
    const link = entry.links.find((l) => l.href.startsWith(PREFIJO_OPENDAP))
    if (link === undefined) continue
    granulos.push({ fecha: entry.time_start.slice(0, 10), urlOpendap: link.href })
  }
  return granulos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

export function construirUrlCmrMes(anio: number, mes: number): string {
  const desde = `${anio}-${pad2(mes)}-01`
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const hasta = `${anio}-${pad2(mes)}-${pad2(ultimoDia)}`
  return (
    'https://cmr.earthdata.nasa.gov/search/granules.json' +
    '?short_name=GPM_3IMERGDF&version=07&page_size=50&sort_key=start_date' +
    `&temporal=${desde}T00:00:00Z,${hasta}T23:59:59Z`
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// ---------------------------------------------------------------------------
// Subset diario OPeNDAP (ASCII) y parseo a celdas
// ---------------------------------------------------------------------------

export function construirUrlSubsetDiario(urlOpendap: string): string {
  const i = calcularIndicesGrillaImerg(IMERG_LAT_MIN, IMERG_LAT_MAX, IMERG_LON_MIN, IMERG_LON_MAX)
  const rangoLon = `%5B${i.lonIndiceInicio}:1:${i.lonIndiceFin}%5D`
  const rangoLat = `%5B${i.latIndiceInicio}:1:${i.latIndiceFin}%5D`
  return (
    `${urlOpendap}.dap.csv?dap4.ce=` +
    `/precipitation%5B0:1:0%5D${rangoLon}${rangoLat};` +
    `/lat${rangoLat};` +
    `/lon${rangoLon}`
  )
}

const REGEX_FILA_PRECIPITACION = /^\/precipitation\[0\]\[(\d+)\]\s*,/

function parsearEjeNumerico(linea: string): number[] {
  return linea
    .slice(linea.indexOf(',') + 1)
    .split(',')
    .map((v) => Number(v.trim()))
}

function valorPrecipitacion(crudo: number): number | null {
  return Number.isFinite(crudo) && crudo >= 0 ? crudo : null
}

export function parsearSubsetDiario(texto: string): Map<string, number | null> {
  let lon: number[] | null = null
  let lat: number[] | null = null
  const filas: { lonIndiceRelativo: number; valores: number[] }[] = []

  for (const linea of texto.split(/\r?\n/)) {
    const recortada = linea.trim()
    if (recortada.length === 0 || recortada.startsWith('Dataset:')) continue

    if (recortada.startsWith('/lon,')) {
      lon = parsearEjeNumerico(recortada)
      continue
    }
    if (recortada.startsWith('/lat,')) {
      lat = parsearEjeNumerico(recortada)
      continue
    }
    const match = REGEX_FILA_PRECIPITACION.exec(recortada)
    if (match !== null) {
      filas.push({
        lonIndiceRelativo: Number(match[1]),
        valores: parsearEjeNumerico(recortada),
      })
    }
  }

  if (lat === null || lon === null || filas.length === 0) {
    throw new Error('Subset IMERG diario inválido: faltan /lat, /lon o filas de precipitación')
  }

  const mapa = new Map<string, number | null>()
  for (const fila of filas) {
    const longitud = lon[fila.lonIndiceRelativo]
    if (longitud === undefined) continue
    lat.forEach((latitud, j) => {
      const clave = celdaDeCoordenada(latitud, longitud)
      if (mapa.has(clave)) return
      mapa.set(clave, valorPrecipitacion(fila.valores[j] ?? Number.NaN))
    })
  }
  return mapa
}
