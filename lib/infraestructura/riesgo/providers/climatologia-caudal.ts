// Climatología de caudal diario (GloFAS vía Open-Meteo Flood API) para los
// puntos fijos de río. Es la contraparte de caudal de `climatologia.ts`
// (precipitación/ERA5): mismo mecanismo de percentiles offline y bajo demanda,
// pero contra otro endpoint y otra variable.
//
// A diferencia de los adapters de pronóstico, esto NO implementa
// `HazardProvider`: no está atado al "ahora" de una corrida, es un cálculo
// offline sobre una ventana histórica fija.
//
// Se separa en dos piezas deliberadamente:
// - `calcularPercentilesCaudal`: función pura, sin red, testeable con series
//   sintéticas conocidas.
// - `obtenerSeriesHistoricasCaudal`: arma la solicitud real por LOTES de
//   coordenadas, valida el payload con Zod y descarta los días sin dato
//   (null) en vez de imputarlos como 0 m³/s.
//
// Verificado en vivo el 2026-09-26: el endpoint de pronóstico de inundación
// también sirve historia (mismo esquema que archive-api para precipitación),
// con `river_discharge` en vez de `precipitation_sum` y soporte de múltiples
// coordenadas separadas por coma en una sola request.
import { z } from 'zod'
import { ejecutarConReintentos } from './cliente-http'
import { agregarApiKey, apiKeyDesdeEntorno, construirBaseUrl, pesoLlamada } from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import type { HazardClimatologiaPunto } from '../tipos-hazard'
import type { PuntoRio } from '../puntos-rio'

const RUTA = '/v1/flood'
const PERCENTILES = [90, 95, 99] as const
const CANTIDAD_VARIABLES_CAUDAL_CLIMATOLOGIA = 1

/** Días de calendario entre dos fechas `YYYY-MM-DD` (inclusive), para OM-cupo. */
function diasEntreFechas(desde: string, hasta: string): number {
  const msPorDia = 86_400_000
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / msPorDia) + 1
  return Math.max(1, dias)
}

// Forma de `HazardClimatologiaPunto` con `variable`/`muestra` angostados a lo
// único que produce el caudal. El tipo compartido está atado a precipitación
// (`variable` literal 'precipitacion_diaria') y a la vez admite
// 'dias_humedos'; ninguno de los dos aplica acá. No se toca
// `tipos-hazard.ts` (fuera de alcance de E3a), así que el caudal define su
// propio tipo derivado.
export type HazardClimatologiaCaudalPunto = Omit<
  HazardClimatologiaPunto,
  'variable' | 'muestra'
> & {
  variable: 'caudal_diario'
  muestra: 'todos_los_dias'
}

/** Percentil por índice: orden ascendente, `ceil(p/100 * n) - 1` clampeado. */
function calcularPercentil(valoresOrdenados: number[], percentil: number): number {
  const n = valoresOrdenados.length
  const indice = Math.min(Math.max(Math.ceil((percentil / 100) * n) - 1, 0), n - 1)
  return valoresOrdenados[indice]
}

/**
 * Calcula las 3 filas de climatología (p90/p95/p99) para un punto de río.
 *
 * A diferencia de precipitación, el caudal usa SIEMPRE `muestra:
 * 'todos_los_dias'`: la noción de "día húmedo" (>= 1 mm) no tiene sentido para
 * una descarga en m³/s — no existe un umbral equivalente, así que se emite una
 * sola muestra y no se agrega la distinción `dias_humedos`.
 *
 * La unidad es 'm3s' (texto simple, sin el carácter '³') para no depender de
 * cómo se serialice el superíndice en la columna `unidad`.
 */
export function calcularPercentilesCaudal(params: {
  geometryRef: string
  valoresDiarios: number[]
  periodoDesde: string
  periodoHasta: string
}): HazardClimatologiaCaudalPunto[] {
  const { geometryRef, valoresDiarios, periodoDesde, periodoHasta } = params

  const ordenados = [...valoresDiarios].sort((a, b) => a - b)
  if (ordenados.length === 0) return []

  return PERCENTILES.map((percentil) => ({
    geometryRef,
    variable: 'caudal_diario',
    percentil: `p${percentil}` as HazardClimatologiaCaudalPunto['percentil'],
    muestra: 'todos_los_dias',
    valor: calcularPercentil(ordenados, percentil),
    unidad: 'm3s',
    periodoDesde,
    periodoHasta,
  }))
}

// GloFAS puede devolver null en días sin dato consolidado: se modela como
// nullable y luego se descarta (NO se convierte a 0 m³/s).
const serieCaudal = z.array(z.number().nullable())

// Un objeto por punto. Con una sola coordenada Open-Meteo responde un objeto
// suelto; con varias, un array de estos objetos en el orden pedido.
const payloadCaudalElementoSchema = z
  .object({
    daily: z.object({
      time: z.array(z.string()),
      river_discharge: serieCaudal,
    }),
  })
  .superRefine((valor, ctx) => {
    const esperado = valor.daily.time.length
    if (valor.daily.river_discharge.length !== esperado) {
      ctx.addIssue({
        code: 'custom',
        message: `daily.river_discharge tiene ${valor.daily.river_discharge.length} elementos; se esperaban ${esperado} (igual que daily.time)`,
      })
    }
  })

// 50 coordenadas por request: misma decisión que ERA5, URLs acotadas. Con los
// 8 puntos actuales de `PUNTOS_RIO` todo entra en un único lote (1 request).
export const TAMANO_LOTE_COORDENADAS_CAUDAL = 50

/** Parte un array en lotes contiguos de `tamano` sin reordenar. */
function agruparEnLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano))
  }
  return lotes
}

export type ResultadoSeriesHistoricasCaudal = {
  /** Serie diaria (sin nulls) por id de punto; sólo de los que respondieron. */
  seriesPorPunto: Record<string, number[]>
  /** Fallo por id de punto con el motivo/detalle de `ejecutarConReintentos`. */
  erroresPorPunto: Record<string, { motivo: string; detalle: string }>
}

function construirUrlLote(
  puntos: readonly PuntoRio[],
  periodoDesde: string,
  periodoHasta: string,
  apiKey: string | undefined,
): string {
  const latitudes = puntos.map((punto) => String(punto.lat)).join(',')
  const longitudes = puntos.map((punto) => String(punto.lon)).join(',')
  const base = construirBaseUrl('flood-api', RUTA, apiKey)
  const url = `${base}?latitude=${latitudes}&longitude=${longitudes}&start_date=${periodoDesde}&end_date=${periodoHasta}&daily=river_discharge&timezone=UTC`
  return agregarApiKey(url, apiKey)
}

/**
 * Valida el payload de un lote. Acepta objeto suelto (una coordenada) o array
 * (varias) y exige que la cantidad coincida con las coordenadas enviadas: si
 * no, el lote entero cae como `payload_invalido` en vez de quedar desalineado.
 */
function crearParserLoteCaudal(cantidad: number) {
  return (json: unknown): Array<z.infer<typeof payloadCaudalElementoSchema>> => {
    const bruto = Array.isArray(json) ? json : [json]
    if (bruto.length !== cantidad) {
      throw new Error(
        `se esperaban ${cantidad} objetos (uno por coordenada) y llegaron ${bruto.length}`,
      )
    }
    return bruto.map((elemento) => payloadCaudalElementoSchema.parse(elemento))
  }
}

/**
 * Obtiene la serie histórica diaria de caudal de VARIOS puntos de río en una
 * sola pasada, consultando por lotes de `TAMANO_LOTE_COORDENADAS_CAUDAL`.
 * Open-Meteo devuelve un array en el mismo orden que las coordenadas enviadas,
 * así que el parseo empareja por índice. Un lote caído no tumba a los demás:
 * sus puntos quedan en `erroresPorPunto` y el resto devuelve datos.
 */
export async function obtenerSeriesHistoricasCaudal(params: {
  puntos: readonly PuntoRio[]
  periodoDesde: string
  periodoHasta: string
  fetchImpl?: typeof fetch
  apiKey?: string
  /** OM-cupo (opt-in): ver el mismo parámetro en providers/ecmwf.ts. */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): Promise<ResultadoSeriesHistoricasCaudal> {
  const seriesPorPunto: Record<string, number[]> = {}
  const erroresPorPunto: Record<string, { motivo: string; detalle: string }> = {}
  const apiKey = params.apiKey ?? apiKeyDesdeEntorno()
  const dias = diasEntreFechas(params.periodoDesde, params.periodoHasta)

  const lotes = agruparEnLotes(params.puntos, TAMANO_LOTE_COORDENADAS_CAUDAL)

  for (const lote of lotes) {
    const peso = pesoLlamada({
      ubicaciones: lote.length,
      variables: CANTIDAD_VARIABLES_CAUDAL_CLIMATOLOGIA,
      dias,
    })
    const cupo = params.controladorCupoFactory?.(peso)
    const resultado = await ejecutarConReintentos<
      Array<z.infer<typeof payloadCaudalElementoSchema>>
    >({
      url: construirUrlLote(lote, params.periodoDesde, params.periodoHasta, apiKey),
      fetchImpl: params.fetchImpl,
      cupo,
      parsearPayload: crearParserLoteCaudal(lote.length),
    })

    if (!resultado.ok) {
      const fallo = { motivo: resultado.motivo, detalle: resultado.detalle }
      for (const punto of lote) {
        erroresPorPunto[punto.id] = fallo
      }
      continue
    }

    lote.forEach((punto, indice) => {
      seriesPorPunto[punto.id] = resultado.datos[indice].daily.river_discharge.filter(
        (valor): valor is number => valor !== null,
      )
    })
  }

  return { seriesPorPunto, erroresPorPunto }
}
