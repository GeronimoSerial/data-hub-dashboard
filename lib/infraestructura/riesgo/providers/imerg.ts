// Parser puro de NASA GPM IMERG Early Run (precipitación observada estimada
// por satélite). Este módulo NO hace red ni lee el token de Earthdata: recibe
// texto/JSON ya descargado y lo transforma. La búsqueda de gránulos (CMR), el
// subsetting server-side vía OPeNDAP ASCII y la persistencia viven en una tarea
// posterior.
import { z } from 'zod'
import { celdaDeCoordenada } from '../celda'
import { CONFIG_FUENTES } from './config-fuentes'

// ---------------------------------------------------------------------------
// Búsqueda de gránulos (CMR metadata, JSON)
// ---------------------------------------------------------------------------

// Forma mínima que necesitamos del payload de CMR. `z.object` descarta las
// claves extra (boxes, dataset_id, hreflang, etc.) que no usamos.
const cmrLinkSchema = z.object({
  rel: z.string(),
  href: z.string(),
})

const cmrEntrySchema = z.object({
  title: z.string(),
  time_start: z.string(),
  time_end: z.string(),
  links: z.array(cmrLinkSchema),
})

const cmrRespuestaSchema = z.object({
  feed: z.object({
    entry: z.array(cmrEntrySchema),
  }),
})

// El link de datos real es el único cuyo href apunta al archivo `.HDF5`.
// Los demás links del payload son credenciales S3, OPeNDAP, documentación y
// otros servicios. Case-sensitive porque así viene siempre en este producto.
export function esGranuloDeDatos(link: { rel: string; href: string }): boolean {
  return link.href.endsWith('.HDF5')
}

export type GranuloImerg = { titulo: string; inicioEn: string; finEn: string; urlDatos: string }

// Extrae todos los gránulos con link de datos del payload de CMR, en el mismo
// orden en que vienen (si quien llama pidió `sort_key=-start_date`, quedan del
// más reciente al más viejo). Un entry sin link `.HDF5` se descarta en vez de
// romper el listado completo. Payload vacío/inesperado => lista vacía, nunca
// un crash (fuente vencida es un estado esperado, no un error).
export function listarGranulosDelPayload(cmrJson: unknown): GranuloImerg[] {
  const parseado = cmrRespuestaSchema.safeParse(cmrJson)
  if (!parseado.success) return []

  const granulos: GranuloImerg[] = []
  for (const entry of parseado.data.feed.entry) {
    const linkDatos = entry.links.find(esGranuloDeDatos)
    if (linkDatos === undefined) continue
    granulos.push({
      titulo: entry.title,
      inicioEn: entry.time_start,
      finEn: entry.time_end,
      urlDatos: linkDatos.href,
    })
  }
  return granulos
}

// Elige el gránulo del payload asumiendo que quien llama ya pidió
// `sort_key=-start_date&page_size=1`: tomamos el PRIMERO con link de datos, no
// reordenamos. Devuelve null ante payload vacío/inesperado (fuente vencida =>
// "sin gránulo disponible", no un crash) o cuando no hay link de datos.
export function elegirGranuloMasReciente(cmrJson: unknown): GranuloImerg | null {
  return listarGranulosDelPayload(cmrJson)[0] ?? null
}

// ---------------------------------------------------------------------------
// Grilla global IMERG (0,1°) e índices del bbox
// ---------------------------------------------------------------------------

// Mismo bbox de Corrientes que usa geo-perfil.ts (LAT_MIN/-32, LAT_MAX/-26,
// LON_MIN/-61, LON_MAX/-54), con margen para no cortar escuelas de borde.
export const IMERG_LAT_MIN = -32
export const IMERG_LAT_MAX = -26
export const IMERG_LON_MIN = -61
export const IMERG_LON_MAX = -54

// Grilla global verificada con datos reales: lat[i] = -89.95 + i*0.1 (1800
// valores, -89.95..89.95) y lon[i] = -179.95 + i*0.1 (3600 valores). La
// variable `precipitation` del dataset tiene forma [time=1][lon=3600][lat=1800]:
// el PRIMER índice espacial es LONGITUD y el SEGUNDO LATITUD (no es obvio por
// el nombre de la variable; ver fixture imerg-2026-09-26.dds).
const PASO_GRILLA_GRADOS = 0.1
const LAT_ORIGEN_GRILLA = -89.95
const LON_ORIGEN_GRILLA = -179.95

function indiceLat(lat: number): number {
  return Math.round((lat - LAT_ORIGEN_GRILLA) / PASO_GRILLA_GRADOS)
}

function indiceLon(lon: number): number {
  return Math.round((lon - LON_ORIGEN_GRILLA) / PASO_GRILLA_GRADOS)
}

// Devuelve índices ordenados (inicio <= fin) para el bbox pedido.
//
// Nota histórica: la prueba manual de N1 usó un bbox ligeramente distinto
// (-30.8, -27.1, -59.7, -55.6 aprox) que generó los índices
// lon 1203:1244 / lat 592:628 del fixture real; ese fixture en realidad
// corresponde al bbox exacto sobre grilla -30.75/-27.15 y -59.65/-55.55.
export function calcularIndicesGrillaImerg(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
): {
  lonIndiceInicio: number
  lonIndiceFin: number
  latIndiceInicio: number
  latIndiceFin: number
} {
  const latA = indiceLat(latMin)
  const latB = indiceLat(latMax)
  const lonA = indiceLon(lonMin)
  const lonB = indiceLon(lonMax)

  return {
    lonIndiceInicio: Math.min(lonA, lonB),
    lonIndiceFin: Math.max(lonA, lonB),
    latIndiceInicio: Math.min(latA, latB),
    latIndiceFin: Math.max(latA, latB),
  }
}

// ---------------------------------------------------------------------------
// URL de subsetting OPeNDAP ASCII
// ---------------------------------------------------------------------------

const HOST_DATOS_GESDISC = `https://${CONFIG_FUENTES.imergOpendap.host}/data/`
const HOST_OPENDAP_GESDISC = `https://${CONFIG_FUENTES.imergOpendap.hostAlterno}/opendap/`

// Reemplaza host+ruta de descarga por el del servidor OPeNDAP y agrega el
// query `.ascii` con los corchetes URL-encodeados (%5B/%5D); los dos puntos no
// hace falta encodearlos. El orden del subsetting es [lon][lat] para
// `precipitation`/`precipitationQualityIndex`, y `lat`/`lon` van como
// variables 1-D adicionales.
//
// `precipitationQualityIndex` se pide en la misma llamada (confirmado en el
// `.dds` real, ver imerg-2026-09-26.dds): no cuesta un request adicional,
// sólo agrega ~6 KB más al mismo subset. Corrige el hallazgo de revisión
// "minor — calidad" (antes `calidad` quedaba siempre null).
export function construirUrlSubsetImerg(params: {
  urlDatosGranulo: string
  lonIndiceInicio: number
  lonIndiceFin: number
  latIndiceInicio: number
  latIndiceFin: number
}): string {
  const urlBase = params.urlDatosGranulo.replace(HOST_DATOS_GESDISC, HOST_OPENDAP_GESDISC)

  const lon = `%5B${params.lonIndiceInicio}:${params.lonIndiceFin}%5D`
  const lat = `%5B${params.latIndiceInicio}:${params.latIndiceFin}%5D`
  const subset = `precipitation%5B0%5D${lon}${lat},precipitationQualityIndex%5B0%5D${lon}${lat},lat${lat},lon${lon}`

  return `${urlBase}.ascii?${subset}`
}

// ---------------------------------------------------------------------------
// Parseo de la respuesta ASCII de OPeNDAP
// ---------------------------------------------------------------------------

export type RespuestaAsciiImerg = {
  lat: number[]
  lon: number[]
  filas: Array<{ lonIndiceRelativo: number; valoresPorLat: number[] }>
  // `precipitationQualityIndex` es opcional en la respuesta: sólo viene si
  // quien construyó la URL la pidió (construirUrlSubsetImerg la pide desde
  // esta versión, pero un fixture viejo o una respuesta parcial no la trae).
  // Array vacío cuando no vino ninguna fila de calidad.
  filasCalidad: Array<{ lonIndiceRelativo: number; valoresPorLat: number[] }>
}

const REGEX_FILA_PRECIPITACION = /^precipitation\[0\]\[(\d+)\]/
// Prefijo distinto de `precipitation[0][...]` (no hay ambigüedad de match: el
// nombre completo de la variable es "precipitationQualityIndex", nunca
// "precipitation" seguido de "[0]" para esta fila).
const REGEX_FILA_CALIDAD = /^precipitationQualityIndex\[0\]\[(\d+)\]/

function parsearValoresNumericos(segmento: string): number[] {
  return segmento
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0)
    .map((parte) => Number(parte))
}

// Parsea texto plano OPeNDAP ASCII. El índice `i` de cada fila
// `precipitation[0][i]` corresponde a `lon[i]` relativo al subset, y cada
// columna de la fila corresponde a `lat[columna]` en el mismo orden.
// A diferencia de elegirGranuloMasReciente, acá un formato inesperado SÍ es un
// error real (ya pasamos la etapa de "no hay dato disponible").
export function parsearRespuestaAsciiImerg(texto: string): RespuestaAsciiImerg {
  const filas: RespuestaAsciiImerg['filas'] = []
  const filasCalidad: RespuestaAsciiImerg['filasCalidad'] = []
  let lat: number[] | null = null
  let lon: number[] | null = null

  for (const linea of texto.split(/\r?\n/)) {
    const recortada = linea.trim()
    if (recortada.length === 0 || recortada.startsWith('Dataset:')) continue

    // La fila de calidad se chequea antes: su prefijo no calza con
    // REGEX_FILA_PRECIPITACION (ver comentario del regex), pero probarla
    // primero evita depender de ese detalle si el nombre de variable cambiara.
    const matchCalidad = REGEX_FILA_CALIDAD.exec(recortada)
    if (matchCalidad !== null) {
      const lonIndiceRelativo = Number(matchCalidad[1])
      const primerComa = recortada.indexOf(',')
      const valores =
        primerComa === -1 ? [] : parsearValoresNumericos(recortada.slice(primerComa + 1))
      filasCalidad.push({ lonIndiceRelativo, valoresPorLat: valores })
      continue
    }

    const matchFila = REGEX_FILA_PRECIPITACION.exec(recortada)
    if (matchFila !== null) {
      const lonIndiceRelativo = Number(matchFila[1])
      const primerComa = recortada.indexOf(',')
      const valores =
        primerComa === -1 ? [] : parsearValoresNumericos(recortada.slice(primerComa + 1))
      filas.push({ lonIndiceRelativo, valoresPorLat: valores })
      continue
    }

    if (recortada.startsWith('lat,')) {
      lat = parsearValoresNumericos(recortada.slice(recortada.indexOf(',') + 1))
      continue
    }

    if (recortada.startsWith('lon,')) {
      lon = parsearValoresNumericos(recortada.slice(recortada.indexOf(',') + 1))
      continue
    }
  }

  if (filas.length === 0) {
    throw new Error('Respuesta ASCII IMERG inválida: no se encontró ninguna fila precipitation[0][i]')
  }
  if (lat === null) {
    throw new Error('Respuesta ASCII IMERG inválida: falta la línea "lat,"')
  }
  if (lon === null) {
    throw new Error('Respuesta ASCII IMERG inválida: falta la línea "lon,"')
  }

  return { lat, lon, filas, filasCalidad }
}

// ---------------------------------------------------------------------------
// Mapeo a observaciones por celda
// ---------------------------------------------------------------------------

export type HazardObservationPunto = {
  geometryRef: string
  variable: 'precipitacion_observada_satelital'
  valor: number
  unidad: 'mm/30min'
  observadoEn: string
  validoDesde: string
  validoHasta: string
  calidad: number | null
}

type FuncionCelda = (lat: number, lon: number) => string

// BLOQUEANTE corregido (docs/ejecucion-enos/E3a/registro.md, §"Correcciones
// del gate N1"): la variable `precipitation` de OPeNDAP es una TASA en mm/h
// del gránulo de media hora (confirmado con el `.dds` real: no es un
// acumulado). Antes se guardaba `rate_mm_h` tal cual con unidad 'mm/30min'
// (2x más alto de lo real). El acumulado de la media hora es
// `rate_mm_h * 0.5`; la unidad se mantiene 'mm/30min' porque ahora sí
// describe lo que el valor representa.
const FACTOR_TASA_A_ACUMULADO_30MIN = 0.5

// Genera una observación por cada (fila, columna) de la grilla IMERG subseteada.
//
// Limitación conocida y documentada por N1: la grilla IMERG (0,1°) está corrida
// media celda respecto a la grilla de E2 (`celdaDeCoordenada` redondea a 0,1°),
// por lo que dos coordenadas IMERG pueden caer en la MISMA celda de E2. Cuando
// eso pasa nos quedamos con el PRIMER valor encontrado en orden de iteración:
// NO promediamos ni sumamos. Es una simplificación aceptada para esta tarea.
//
// `celdaDeCoordenada` se inyecta para testear; por defecto usa la implementación
// real de ../celda.ts (no se reimplementa acá).
//
// Nota: la función resuelve la coordenada absoluta desde `parseado.lon`/
// `parseado.lat` (ya vienen absolutos en la respuesta OPeNDAP), por eso no
// recibe (ni necesita) los índices de inicio del subset — ver hallazgo de
// revisión "minor D" en el registro.
export function mapearAsciiImergACeldas(params: {
  parseado: ReturnType<typeof parsearRespuestaAsciiImerg>
  observadoEn: string
  validoDesde: string
  validoHasta: string
  celdaDeCoordenada?: FuncionCelda
}): HazardObservationPunto[] {
  const celda: FuncionCelda = params.celdaDeCoordenada ?? celdaDeCoordenada
  const celdasVistas = new Set<string>()
  const puntos: HazardObservationPunto[] = []

  // Índice (lonIndiceRelativo -> valoresPorLat) de la fila de calidad
  // correspondiente, cuando la respuesta la trajo. Mismo criterio de
  // alineación fila/columna que `precipitation`.
  const calidadPorLon = new Map<number, number[]>(
    params.parseado.filasCalidad.map((fila) => [fila.lonIndiceRelativo, fila.valoresPorLat]),
  )

  for (const fila of params.parseado.filas) {
    const lon = params.parseado.lon[fila.lonIndiceRelativo]
    if (lon === undefined) continue
    const valoresCalidad = calidadPorLon.get(fila.lonIndiceRelativo)

    for (let columna = 0; columna < fila.valoresPorLat.length; columna++) {
      const lat = params.parseado.lat[columna]
      const tasaMmH = fila.valoresPorLat[columna]
      if (lat === undefined || tasaMmH === undefined) continue

      const geometryRef = celda(lat, lon)
      if (celdasVistas.has(geometryRef)) continue
      celdasVistas.add(geometryRef)

      const calidad = valoresCalidad?.[columna]

      puntos.push({
        geometryRef,
        variable: 'precipitacion_observada_satelital',
        valor: tasaMmH * FACTOR_TASA_A_ACUMULADO_30MIN,
        unidad: 'mm/30min',
        observadoEn: params.observadoEn,
        validoDesde: params.validoDesde,
        validoHasta: params.validoHasta,
        calidad: calidad === undefined ? null : calidad,
      })
    }
  }

  return puntos
}
