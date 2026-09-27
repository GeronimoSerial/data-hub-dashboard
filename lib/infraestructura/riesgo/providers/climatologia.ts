// Climatología de precipitación diaria a partir del archivo histórico de
// Open-Meteo (ERA5). A diferencia de los adapters de pronóstico, esto NO
// implementa `HazardProvider`: no está atado al "ahora" de una corrida, es un
// cálculo offline y bajo demanda de percentiles sobre una serie histórica.
//
// Se separa en dos piezas deliberadamente:
// - `calcularPercentilesPrecipitacion`: función pura, sin red, testeable con
//   series sintéticas conocidas.
// - `obtenerSeriesHistoricas`: arma la solicitud real por LOTES de coordenadas,
//   valida el payload con Zod y descarta los días sin dato (null) en vez de
//   imputarlos como 0 mm.
// - `obtenerSerieHistorica`: envoltura de un solo punto sobre la anterior, para
//   la firma que ya consume el job de climatología.
import { z } from 'zod'
import { ejecutarConReintentos } from './cliente-http'
import type { HazardClimatologiaPunto } from '../tipos-hazard'

const BASE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const PERCENTILES = [90, 95, 99] as const
const UMBRAL_DIA_HUMEDO_MM = 1

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
  /** Cantidad de requests HTTP efectivamente disparadas (una por lote). */
  llamadasRealizadas: number
  /** Tamaño de cada lote, en el mismo orden en que se hicieron las llamadas. */
  celdasPorLlamada: number[]
}

function construirUrlLote(
  puntos: PuntoClimatologia[],
  periodoDesde: string,
  periodoHasta: string,
): string {
  const latitudes = puntos.map((punto) => String(punto.lat)).join(',')
  const longitudes = puntos.map((punto) => String(punto.lon)).join(',')
  return `${BASE_URL}?latitude=${latitudes}&longitude=${longitudes}&start_date=${periodoDesde}&end_date=${periodoHasta}&daily=precipitation_sum&timezone=UTC`
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
 * sola pasada, consultando por lotes de `TAMANO_LOTE_COORDENADAS`. Open-Meteo
 * devuelve un array en el mismo orden que las coordenadas enviadas, así que el
 * parseo empareja por índice. Un lote caído no tumba a los demás: sus puntos
 * quedan en `erroresPorCelda` y el resto devuelve datos.
 */
export async function obtenerSeriesHistoricas(params: {
  puntos: PuntoClimatologia[]
  periodoDesde: string
  periodoHasta: string
  fetchImpl?: typeof fetch
}): Promise<ResultadoSeriesHistoricas> {
  const seriesPorCelda: Record<string, number[]> = {}
  const erroresPorCelda: Record<string, { motivo: string; detalle: string }> = {}
  const celdasPorLlamada: number[] = []

  const lotes = agruparEnLotes(params.puntos, TAMANO_LOTE_COORDENADAS)

  for (const lote of lotes) {
    celdasPorLlamada.push(lote.length)
    const resultado = await ejecutarConReintentos<Array<z.infer<typeof payloadArchivoElementoSchema>>>({
      url: construirUrlLote(lote, params.periodoDesde, params.periodoHasta),
      fetchImpl: params.fetchImpl,
      parsearPayload: crearParserLoteClima(lote.length),
    })

    if (!resultado.ok) {
      const fallo = { motivo: resultado.motivo, detalle: resultado.detalle }
      for (const punto of lote) {
        erroresPorCelda[punto.geometryRef] = fallo
      }
      continue
    }

    lote.forEach((punto, indice) => {
      seriesPorCelda[punto.geometryRef] = resultado.datos[indice].daily.precipitation_sum.filter(
        (valor): valor is number => valor !== null,
      )
    })
  }

  return { seriesPorCelda, erroresPorCelda, llamadasRealizadas: lotes.length, celdasPorLlamada }
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
}): Promise<{ ok: true; valoresDiarios: number[] } | { ok: false; motivo: string; detalle: string }> {
  const geometryRef = `${params.lat}_${params.lon}`
  const resultado = await obtenerSeriesHistoricas({
    puntos: [{ geometryRef, lat: params.lat, lon: params.lon }],
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
