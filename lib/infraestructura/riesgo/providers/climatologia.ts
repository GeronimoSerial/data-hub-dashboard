// Climatología de precipitación diaria a partir del archivo histórico de
// Open-Meteo (ERA5). A diferencia de los adapters de pronóstico, esto NO
// implementa `HazardProvider`: no está atado al "ahora" de una corrida, es un
// cálculo offline y bajo demanda de percentiles sobre una serie histórica.
//
// Se separa en dos piezas deliberadamente:
// - `calcularPercentilesPrecipitacion`: función pura, sin red, testeable con
//   series sintéticas conocidas.
// - `obtenerSerieHistorica`: arma la solicitud real, valida el payload con Zod
//   y descarta los días sin dato (null) en vez de imputarlos como 0 mm.
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

const payloadArchivoSchema = z
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

function construirUrl(params: {
  lat: number
  lon: number
  periodoDesde: string
  periodoHasta: string
}): string {
  const { lat, lon, periodoDesde, periodoHasta } = params
  return `${BASE_URL}?latitude=${lat}&longitude=${lon}&start_date=${periodoDesde}&end_date=${periodoHasta}&daily=precipitation_sum&timezone=UTC`
}

/**
 * Obtiene la serie histórica diaria de precipitación de un punto. Los días sin
 * dato (`null`) se descartan, no se imputan. Devuelve `ok:false` propagando el
 * motivo/detalle de `ejecutarConReintentos` ante cualquier fallo.
 */
export async function obtenerSerieHistorica(params: {
  lat: number
  lon: number
  periodoDesde: string
  periodoHasta: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; valoresDiarios: number[] } | { ok: false; motivo: string; detalle: string }> {
  const resultado = await ejecutarConReintentos<z.infer<typeof payloadArchivoSchema>>({
    url: construirUrl(params),
    fetchImpl: params.fetchImpl,
    parsearPayload: (json) => payloadArchivoSchema.parse(json),
  })

  if (!resultado.ok) {
    return { ok: false, motivo: resultado.motivo, detalle: resultado.detalle }
  }

  const valoresDiarios = resultado.datos.daily.precipitation_sum.filter(
    (valor): valor is number => valor !== null,
  )
  return { ok: true, valoresDiarios }
}
