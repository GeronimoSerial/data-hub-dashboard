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
//   coordenadas y tramos de período, valida el payload con Zod y descarta los días sin dato
//   (null) en vez de imputarlos como 0 m³/s.
//
// Verificado en vivo el 2026-09-26: el endpoint de pronóstico de inundación
// también sirve historia (mismo esquema que archive-api para precipitación),
// con `river_discharge` en vez de `precipitation_sum` y soporte de múltiples
// coordenadas separadas por coma en una sola request.
import { z } from 'zod'
import {
  agruparEnLotes,
  construirUrlLoteOpenMeteo,
  crearParserLote,
  diasMaximosPorTramo,
  partirPeriodoEnTramos,
} from './lotes'
import { calcularPercentil, diasEntreFechas } from './estadistica'
import { ejecutarConReintentos } from './cliente-http'
import { CONFIG_FUENTES } from './config-fuentes'
import {
  apiKeyDesdeEntorno,
  asegurarPesoAlcanzable,
  limiteVentana,
  MOTIVOS_CUPO_SIN_RED,
  pesoLlamada,
} from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import type { HazardClimatologiaPunto } from '../tipos-hazard'
import type { PuntoRio } from '../puntos-rio'

const RUTA = CONFIG_FUENTES.climatologiaCaudal.ruta
const PERCENTILES = [90, 95, 99] as const
const CANTIDAD_VARIABLES_CAUDAL_CLIMATOLOGIA = 1

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
// 8 puntos actuales de `PUNTOS_RIO` todo entra en un único lote.
export const TAMANO_LOTE_COORDENADAS_CAUDAL = CONFIG_FUENTES.climatologiaCaudal.tamanoLote

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
  return construirUrlLoteOpenMeteo({
    subdominio: 'flood-api',
    ruta: RUTA,
    puntos,
    queryExtra: `&start_date=${periodoDesde}&end_date=${periodoHasta}&daily=river_discharge&timezone=UTC`,
    apiKey,
  })
}

/**
 * Obtiene la serie histórica diaria de caudal de VARIOS puntos de río,
 * consultando por lotes de `TAMANO_LOTE_COORDENADAS_CAUDAL`. Open-Meteo
 * devuelve un array en el mismo orden que las coordenadas enviadas, así que el
 * parseo empareja por índice. Un lote caído no tumba a los demás: sus puntos
 * quedan en `erroresPorPunto` y el resto devuelve datos.
 *
 * Troceo por período (T16a, mismo mecanismo que `climatologia.ts`): pedir los
 * 10 años de un lote en UNA request pesa `puntos × días/14` (8 puntos ≈ 2087),
 * por encima del límite de la ventana de minuto, que se evalúa completo por
 * request: falla siempre con `cupo_minuto_agotado`. Cada lote pide el período
 * en tramos dimensionados contra el límite vigente (`diasMaximosPorTramo` con
 * el tamaño REAL del lote) y concatena las series en memoria; sólo si TODOS
 * los tramos responden ok se asignan las series del lote, así nunca queda un
 * punto con historia parcial. Un motivo "sin red" (guarda de cupo) corta el
 * resto de los lotes y les registra el mismo error.
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
  const apiKeyPresente = Boolean(apiKey)
  const limiteMinuto = limiteVentana('minuto', apiKeyPresente)

  const lotes = agruparEnLotes(params.puntos, TAMANO_LOTE_COORDENADAS_CAUDAL)

  for (let indiceLote = 0; indiceLote < lotes.length; indiceLote++) {
    const lote = lotes[indiceLote]
    const tramos = partirPeriodoEnTramos(
      params.periodoDesde,
      params.periodoHasta,
      diasMaximosPorTramo({
        celdasPorLote: lote.length,
        variables: CANTIDAD_VARIABLES_CAUDAL_CLIMATOLOGIA,
        limiteMinuto,
      }),
    )
    const seriesLote: number[][] = lote.map(() => [])
    let falloLote: { motivo: string; detalle: string } | undefined

    for (const tramo of tramos) {
      const peso = pesoLlamada({
        ubicaciones: lote.length,
        variables: CANTIDAD_VARIABLES_CAUDAL_CLIMATOLOGIA,
        dias: diasEntreFechas(tramo.desde, tramo.hasta),
      })
      // Con `diasMaximosPorTramo` no debería pasar nunca; el check explícito
      // evita depender en silencio de esa cuenta si cambia el margen/límite.
      asegurarPesoAlcanzable({ peso, apiKeyPresente })

      const cupo = params.controladorCupoFactory?.(peso)
      const resultado = await ejecutarConReintentos<
        Array<z.infer<typeof payloadCaudalElementoSchema>>
      >({
        url: construirUrlLote(lote, tramo.desde, tramo.hasta, apiKey),
        fetchImpl: params.fetchImpl,
        cupo,
        parsearPayload: crearParserLote(payloadCaudalElementoSchema, lote.length),
      })

      if (!resultado.ok) {
        falloLote = { motivo: resultado.motivo, detalle: resultado.detalle }
        break
      }

      lote.forEach((_, indice) => {
        seriesLote[indice].push(
          ...resultado.datos[indice].daily.river_discharge.filter(
            (valor): valor is number => valor !== null,
          ),
        )
      })
    }

    if (falloLote) {
      const sinRed = MOTIVOS_CUPO_SIN_RED.has(falloLote.motivo)
      const afectados = sinRed ? lotes.slice(indiceLote).flat() : lote
      for (const punto of afectados) erroresPorPunto[punto.id] = falloLote
      if (sinRed) break
      continue
    }

    lote.forEach((punto, indice) => {
      seriesPorPunto[punto.id] = seriesLote[indice]
    })
  }

  return { seriesPorPunto, erroresPorPunto }
}
