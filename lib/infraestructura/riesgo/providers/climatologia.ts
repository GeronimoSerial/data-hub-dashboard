// Climatología de precipitación diaria a partir del archivo histórico de
// Open-Meteo (ERA5). A diferencia de los adapters de pronóstico, esto NO
// implementa `HazardProvider`: no está atado al "ahora" de una corrida, es un
// cálculo offline y bajo demanda de percentiles sobre una serie histórica.
//
// Se separa en piezas deliberadamente:
// - `calcularPercentilesPrecipitacion`: función pura, sin red, testeable con
//   series sintéticas conocidas.
// - `agruparPuntosPorEra5`/`estimarCostoClimatologia`: deduplicación por celda
//   nativa de ERA5 y estimación de peso (ver "Deduplicación por celda ERA5"
//   más abajo y docs/ejecucion-enos/OM-cupo/registro.md).
// - `obtenerSeriesHistoricas`: arma la solicitud real por LOTES de coordenadas
//   (ya deduplicadas por celda ERA5), valida el payload con Zod y descarta los
//   días sin dato (null) en vez de imputarlos como 0 mm.
// - `obtenerSerieHistorica`: envoltura de un solo punto sobre la anterior, para
//   la firma que ya consume el job de climatología.
//
// -----------------------------------------------------------------------
// Deduplicación por celda ERA5 (OM-cupo, hallazgo crítico del registro)
// -----------------------------------------------------------------------
//
// `pesoLlamada` escala LINEAL en `ubicaciones` sin importar cuántas entren en
// una misma request HTTP (ver cupo-om.ts): agrupar en lotes de 50 reduce el
// overhead de conexiones, pero NO reduce el peso total si se siguen pidiendo
// las ~387 celdas de 0.1° una por una. La única palanca real para bajar el
// peso es reducir el producto `ubicaciones × variables × días`.
//
// ERA5 (la fuente detrás de `/v1/archive`) tiene una resolución NATIVA de
// ~0.25° — más gruesa que la grilla de 0.1° de `infra_geo_profile`
// (`geometryRef` = "lat_lon" redondeado a 0.1°, ver schema.ts). Pedir cada
// celda de 0.1° por separado sólo duplica, bajo interpolación bilineal, el
// mismo dato subyacente varias veces. `agruparPuntosPorEra5` redondea cada
// punto a la celda ERA5 que lo contiene (múltiplo de 0.25°) y agrupa las
// celdas de 0.1° que caen en la misma celda ERA5; `obtenerSeriesHistoricas`
// pide UNA sola serie por grupo (usando la coordenada ya redondeada, que es
// la que efectivamente resuelve ERA5) y la replica a todos los miembros del
// grupo. Esto reduce las `ubicaciones` reales consultadas (y por lo tanto el
// peso) sin fabricar datos: es literalmente el mismo valor de grilla que
// Open-Meteo ya devolvía repetido bajo la implementación anterior.
//
// SUPUESTO documentado (mismo espíritu que el supuesto de `pesoLlamada` sobre
// escalado lineal): se asume que la grilla nativa de ERA5 está alineada a
// múltiplos de 0.25° (`round(valor / 0.25) * 0.25`). Open-Meteo no publica el
// offset exacto de su grilla interna; si el offset real difuriera, el peor
// caso es agrupar de más (dos celdas que en realidad caen en distinta celda
// ERA5 quedan con el mismo valor) — un error de PRECISIÓN espacial acotado a
// ~0.25°, nunca un error de cupo (nunca se subestima el peso real de una
// request ya agrupada).
import { z } from 'zod'
import { ejecutarConReintentos } from './cliente-http'
import { agregarApiKey, apiKeyDesdeEntorno, construirBaseUrl, pesoLlamada } from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import type { HazardClimatologiaPunto } from '../tipos-hazard'

const RUTA = '/v1/archive'
const PERCENTILES = [90, 95, 99] as const
const CANTIDAD_VARIABLES_CLIMATOLOGIA = 1

/** Días de calendario entre dos fechas `YYYY-MM-DD` (inclusive), para OM-cupo. */
function diasEntreFechas(desde: string, hasta: string): number {
  const msPorDia = 86_400_000
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / msPorDia) + 1
  return Math.max(1, dias)
}
const UMBRAL_DIA_HUMEDO_MM = 1

// -----------------------------------------------------------------------
// Deduplicación por celda ERA5 (ver comentario de cabecera del archivo)
// -----------------------------------------------------------------------

/** Resolución nativa asumida de ERA5, en grados (ver supuesto documentado arriba). */
export const GRADOS_CELDA_ERA5 = 0.25

/** Redondea un valor al múltiplo de `GRADOS_CELDA_ERA5` más cercano. */
export function redondearACeldaEra5(valor: number): number {
  return Math.round(valor / GRADOS_CELDA_ERA5) * GRADOS_CELDA_ERA5
}

function claveCeldaEra5(latRedondeada: number, lonRedondeada: number): string {
  return `era5_${latRedondeada.toFixed(2)}_${lonRedondeada.toFixed(2)}`
}

export type GrupoCeldaEra5 = {
  /** Clave de la celda ERA5 (no es un geometryRef real, sólo agrupa). */
  claveEra5: string
  /** Coordenada ya redondeada a la celda ERA5: la que efectivamente se pide. */
  lat: number
  lon: number
  /** geometryRef de 0.1° que caen dentro de esta celda ERA5 (>=1). */
  miembros: string[]
}

/**
 * Agrupa puntos de 0.1° por la celda ERA5 (~0.25°) que los contiene. Varios
 * `geometryRef` de 0.1° pueden colapsar en un único grupo: `obtenerSeriesHistoricas`
 * sólo pide UNA serie por grupo y la replica a todos sus miembros.
 */
export function agruparPuntosPorEra5(puntos: readonly PuntoClimatologia[]): GrupoCeldaEra5[] {
  const grupos = new Map<string, GrupoCeldaEra5>()
  for (const punto of puntos) {
    const latRedondeada = redondearACeldaEra5(punto.lat)
    const lonRedondeada = redondearACeldaEra5(punto.lon)
    const clave = claveCeldaEra5(latRedondeada, lonRedondeada)
    const existente = grupos.get(clave)
    if (existente) {
      existente.miembros.push(punto.geometryRef)
    } else {
      grupos.set(clave, { claveEra5: clave, lat: latRedondeada, lon: lonRedondeada, miembros: [punto.geometryRef] })
    }
  }
  return [...grupos.values()]
}

/**
 * Estima el peso total (unidades de cupo OM-cupo) de calcular la climatología
 * completa para `celdasEra5Unicas` celdas ERA5 ya deduplicadas, para el
 * período y cantidad de variables dados. Usa la misma fórmula que
 * `obtenerSeriesHistoricas` (`pesoLlamada`), así que sirve para presupuestar
 * ANTES de pedir nada (ver docs/ejecucion-enos/OM-cupo/registro.md).
 */
export function estimarCostoClimatologia(params: {
  celdasEra5Unicas: number
  periodoDesde: string
  periodoHasta: string
  variables?: number
}): number {
  const dias = diasEntreFechas(params.periodoDesde, params.periodoHasta)
  return pesoLlamada({
    ubicaciones: params.celdasEra5Unicas,
    variables: params.variables ?? CANTIDAD_VARIABLES_CLIMATOLOGIA,
    dias,
  })
}

/** Percentil por índice: orden ascendente, `ceil(p/100 * n) - 1` clampeado. */
function calcularPercentil(valoresOrdenados: number[], percentil: number): number {
  const n = valoresOrdenados.length
  const indice = Math.min(Math.max(Math.ceil((percentil / 100) * n) - 1, 0), n - 1)
  return valoresOrdenados[indice]
}

/**
 * Calcula las 6 filas de climatología (p90/p95/p99 × muestra) para un punto.
 *
 * Muestras:
 * - `todos_los_dias`: percentil sobre TODOS los días, incluidos los de 0 mm.
 * - `dias_humedos`: se filtra `valor >= 1` (>= 1 mm) ANTES de calcular el
 *   percentil. Si no queda ningún día húmedo, esas 3 filas NO se generan (no
 *   tendría sentido reportar un percentil sobre una muestra vacía).
 *
 * La unidad es siempre 'mm' porque la fuente es `precipitation_sum`.
 */
export function calcularPercentilesPrecipitacion(params: {
  geometryRef: string
  valoresDiarios: number[]
  periodoDesde: string
  periodoHasta: string
}): HazardClimatologiaPunto[] {
  const { geometryRef, valoresDiarios, periodoDesde, periodoHasta } = params

  const todosLosDias = [...valoresDiarios].sort((a, b) => a - b)
  if (todosLosDias.length === 0) return []

  const diasHumedos = valoresDiarios
    .filter((valor) => valor >= UMBRAL_DIA_HUMEDO_MM)
    .sort((a, b) => a - b)

  const filas: HazardClimatologiaPunto[] = []
  for (const percentil of PERCENTILES) {
    filas.push({
      geometryRef,
      variable: 'precipitacion_diaria',
      percentil: `p${percentil}` as HazardClimatologiaPunto['percentil'],
      muestra: 'todos_los_dias',
      valor: calcularPercentil(todosLosDias, percentil),
      unidad: 'mm',
      periodoDesde,
      periodoHasta,
    })

    // Sin días húmedos no se emiten las filas de esa muestra (ver doc arriba).
    if (diasHumedos.length > 0) {
      filas.push({
        geometryRef,
        variable: 'precipitacion_diaria',
        percentil: `p${percentil}` as HazardClimatologiaPunto['percentil'],
        muestra: 'dias_humedos',
        valor: calcularPercentil(diasHumedos, percentil),
        unidad: 'mm',
        periodoDesde,
        periodoHasta,
      })
    }
  }

  return filas
}

// ERA5 puede devolver null en días sin dato consolidado: se modela como
// nullable y luego se descarta (NO se convierte a 0 mm).
const seriePrecipitacion = z.array(z.number().nullable())

// Un objeto por punto. Con una sola coordenada Open-Meteo responde un objeto
// suelto; con varias, un array de estos objetos en el orden pedido.
const payloadArchivoElementoSchema = z
  .object({
    daily: z.object({
      time: z.array(z.string()),
      precipitation_sum: seriePrecipitacion,
    }),
  })
  .superRefine((valor, ctx) => {
    const esperado = valor.daily.time.length
    if (valor.daily.precipitation_sum.length !== esperado) {
      ctx.addIssue({
        code: 'custom',
        message: `daily.precipitation_sum tiene ${valor.daily.precipitation_sum.length} elementos; se esperaban ${esperado} (igual que daily.time)`,
      })
    }
  })

// 50 coordenadas por request: misma decisión que ECMWF — URLs acotadas y
// ~387 celdas reales pasan de ~387 requests a ~8 por cálculo histórico.
export const TAMANO_LOTE_COORDENADAS = 50

/** Parte un array en lotes contiguos de `tamano` sin reordenar. */
function agruparEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano))
  }
  return lotes
}

export type PuntoClimatologia = { geometryRef: string; lat: number; lon: number }

export type ResultadoSeriesHistoricas = {
  /** Serie diaria (sin nulls) por geometryRef; sólo de los puntos que respondieron. */
  seriesPorCelda: Record<string, number[]>
  /** Fallo por geometryRef con el motivo/detalle de `ejecutarConReintentos`. */
  erroresPorCelda: Record<string, { motivo: string; detalle: string }>
  /** Cantidad de requests HTTP efectivamente disparadas (una por lote de celdas ERA5). */
  llamadasRealizadas: number
  /** Tamaño de cada lote (en celdas ERA5, ya deduplicadas), en el orden en que se hicieron las llamadas. */
  celdasPorLlamada: number[]
  /** Cantidad de puntos de 0.1° recibidos en `puntos`, antes de deduplicar por celda ERA5. */
  puntosOriginales: number
  /** Cantidad de celdas ERA5 únicas efectivamente consultadas (después de deduplicar, ver `agruparPuntosPorEra5`). */
  celdasEra5Unicas: number
}

function construirUrlLote(
  puntos: PuntoClimatologia[],
  periodoDesde: string,
  periodoHasta: string,
  apiKey: string | undefined,
): string {
  const latitudes = puntos.map((punto) => String(punto.lat)).join(',')
  const longitudes = puntos.map((punto) => String(punto.lon)).join(',')
  const base = construirBaseUrl('archive-api', RUTA, apiKey)
  const url = `${base}?latitude=${latitudes}&longitude=${longitudes}&start_date=${periodoDesde}&end_date=${periodoHasta}&daily=precipitation_sum&timezone=UTC`
  return agregarApiKey(url, apiKey)
}

/**
 * Valida el payload de un lote. Acepta objeto suelto (una coordenada) o array
 * (varias) y exige que la cantidad coincida con las coordenadas enviadas: si
 * no, el lote entero cae como `payload_invalido` en vez de quedar desalineado.
 */
function crearParserLoteClima(cantidad: number) {
  return (json: unknown): Array<z.infer<typeof payloadArchivoElementoSchema>> => {
    const bruto = Array.isArray(json) ? json : [json]
    if (bruto.length !== cantidad) {
      throw new Error(
        `se esperaban ${cantidad} objetos (uno por coordenada) y llegaron ${bruto.length}`,
      )
    }
    return bruto.map((elemento) => payloadArchivoElementoSchema.parse(elemento))
  }
}

/**
 * Obtiene la serie histórica diaria de precipitación de VARIOS puntos en una
 * sola pasada. Primero deduplica por celda ERA5 (`agruparPuntosPorEra5`, ver
 * comentario de cabecera) y sólo después arma lotes de `TAMANO_LOTE_COORDENADAS`
 * celdas ERA5 únicas. Open-Meteo devuelve un array en el mismo orden que las
 * coordenadas enviadas, así que el parseo empareja por índice; el resultado de
 * cada celda ERA5 se replica a TODOS los `geometryRef` de 0.1° que agrupó. Un
 * lote caído no tumba a los demás: sus miembros quedan en `erroresPorCelda` y
 * el resto devuelve datos.
 */
const MOTIVOS_CUPO_SIN_RED = new Set(['cupo_agotado', 'host_en_cooldown'])

export async function obtenerSeriesHistoricas(params: {
  puntos: PuntoClimatologia[]
  periodoDesde: string
  periodoHasta: string
  fetchImpl?: typeof fetch
  apiKey?: string
  /** OM-cupo (opt-in): ver el mismo parámetro en providers/ecmwf.ts. */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): Promise<ResultadoSeriesHistoricas> {
  const seriesPorCelda: Record<string, number[]> = {}
  const erroresPorCelda: Record<string, { motivo: string; detalle: string }> = {}
  const celdasPorLlamada: number[] = []
  const apiKey = params.apiKey ?? apiKeyDesdeEntorno()
  const dias = diasEntreFechas(params.periodoDesde, params.periodoHasta)

  const gruposEra5 = agruparPuntosPorEra5(params.puntos)
  const lotes = agruparEnLotes(gruposEra5, TAMANO_LOTE_COORDENADAS)

  for (let indiceLote = 0; indiceLote < lotes.length; indiceLote++) {
    const lote = lotes[indiceLote]
    const puntosLote: PuntoClimatologia[] = lote.map((grupo) => ({
      geometryRef: grupo.claveEra5,
      lat: grupo.lat,
      lon: grupo.lon,
    }))
    const peso = pesoLlamada({ ubicaciones: lote.length, variables: CANTIDAD_VARIABLES_CLIMATOLOGIA, dias })
    const cupo = params.controladorCupoFactory?.(peso)
    const resultado = await ejecutarConReintentos<Array<z.infer<typeof payloadArchivoElementoSchema>>>({
      url: construirUrlLote(puntosLote, params.periodoDesde, params.periodoHasta, apiKey),
      fetchImpl: params.fetchImpl,
      cupo,
      parsearPayload: crearParserLoteClima(puntosLote.length),
    })

    if (!resultado.ok) {
      const fallo = { motivo: resultado.motivo, detalle: resultado.detalle }
      for (const grupo of lote) {
        for (const miembro of grupo.miembros) erroresPorCelda[miembro] = fallo
      }
      if (!MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) celdasPorLlamada.push(lote.length)
      if (MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) {
        for (const loteRestante of lotes.slice(indiceLote + 1)) {
          for (const grupo of loteRestante) {
            for (const miembro of grupo.miembros) erroresPorCelda[miembro] = fallo
          }
        }
        break
      }
      continue
    }

    celdasPorLlamada.push(lote.length)
    lote.forEach((grupo, indice) => {
      const serie = resultado.datos[indice].daily.precipitation_sum.filter(
        (valor): valor is number => valor !== null,
      )
      for (const miembro of grupo.miembros) seriesPorCelda[miembro] = serie
    })
  }

  return {
    seriesPorCelda,
    erroresPorCelda,
    llamadasRealizadas: celdasPorLlamada.length,
    celdasPorLlamada,
    puntosOriginales: params.puntos.length,
    celdasEra5Unicas: gruposEra5.length,
  }
}

/**
 * Obtiene la serie histórica diaria de precipitación de un punto. Los días sin
 * dato (`null`) se descartan, no se imputan. Devuelve `ok:false` propagando el
 * motivo/detalle de `ejecutarConReintentos` ante cualquier fallo.
 *
 * Es una envoltura de un solo punto sobre `obtenerSeriesHistoricas` (mismo
 * camino de red, mismo batching): mantiene la firma que ya consume el job de
 * climatología, que todavía itera celda por celda.
 */
export async function obtenerSerieHistorica(params: {
  lat: number
  lon: number
  periodoDesde: string
  periodoHasta: string
  fetchImpl?: typeof fetch
  apiKey?: string
  /** OM-cupo (opt-in): ver el mismo parámetro en providers/ecmwf.ts. */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): Promise<{ ok: true; valoresDiarios: number[] } | { ok: false; motivo: string; detalle: string }> {
  const geometryRef = `${params.lat}_${params.lon}`
  const resultado = await obtenerSeriesHistoricas({
    puntos: [{ geometryRef, lat: params.lat, lon: params.lon }],
    apiKey: params.apiKey,
    controladorCupoFactory: params.controladorCupoFactory,
    periodoDesde: params.periodoDesde,
    periodoHasta: params.periodoHasta,
    fetchImpl: params.fetchImpl,
  })

  const fallo = resultado.erroresPorCelda[geometryRef]
  if (fallo) {
    return { ok: false, motivo: fallo.motivo, detalle: fallo.detalle }
  }

  return { ok: true, valoresDiarios: resultado.seriesPorCelda[geometryRef] ?? [] }
}
