// Adapter del proveedor ECMWF vía Open-Meteo. Traduce la respuesta horaria del
// endpoint `/v1/ecmwf` al contrato `HazardForecastPunto` del dominio.
//
// Decisiones clave:
// - Las celdas se consultan por LOTES de `TAMANO_LOTE_COORDENADAS` en UNA sola
//   request (latitude/longitude separadas por coma): Open-Meteo devuelve un
//   array de objetos, uno por coordenada y EN EL MISMO ORDEN en que se
//   enviaron, así que el parseo empareja por índice. Con ~387 celdas esto baja
//   de ~387 requests a ~8 por ciclo.
// - Cada lote se resuelve con `ejecutarConReintentos`, que ya aporta
//   timeout/backoff/429/cuarentena. Un fallo en un lote no tumba al resto: sus
//   celdas quedan en `erroresPorCelda` y se devuelven los puntos de los lotes
//   que sí respondieron.
// - El paso horario NO es fijo: Open-Meteo entrega 1h, 3h y 6h según el
//   horizonte, así que se deriva de la diferencia real entre timestamps
//   consecutivos (primer punto usa el paso del segundo respecto al primero).
import { z } from 'zod'
import { agruparEnLotes, construirUrlLoteOpenMeteo, crearParserLote } from './lotes'
import { isoUtc, parsearTimestampUtc } from './timestamps'
import { ejecutarConReintentos } from './cliente-http'
import { apiKeyDesdeEntorno, MOTIVOS_CORTAN_LOTES, MOTIVOS_CUPO_SIN_RED, pesoLlamada } from './cupo-om'
import type { ControladorCupoOM } from './cupo-om'
import type { HazardForecastPunto, HazardProvider } from '../tipos-hazard'

const RUTA = '/v1/ecmwf'
const VARIABLES_HOURLY = [
  'precipitation',
  'cape',
  'wind_gusts_10m',
  'temperature_2m',
  'wind_speed_10m',
] as const
const MS_POR_HORA = 3_600_000

// 50 coordenadas por request: mantiene la URL lejos del límite práctico del
// servidor y a la vez reduce ~387 celdas reales a ~8 llamadas por ciclo.
export const TAMANO_LOTE_COORDENADAS = 50

/** Parte un array en lotes contiguos de `tamano` sin reordenar. */
// Open-Meteo puede devolver nulls en el borde del horizonte: se modelan como
// nullable y luego se descartan punto a punto (NO se convierten a 0).
const serieNumerica = z.array(z.number().nullable())

// Un objeto por ubicación. Con una sola coordenada Open-Meteo responde un
// objeto suelto; con varias, un array de estos objetos en el orden pedido.
const payloadEcmwfElementoSchema = z
  .object({
    hourly: z.object({
      time: z.array(z.string()),
      precipitation: serieNumerica,
      cape: serieNumerica,
      wind_gusts_10m: serieNumerica,
      temperature_2m: serieNumerica,
      wind_speed_10m: serieNumerica,
    }),
  })
  .superRefine((valor, ctx) => {
    const { hourly } = valor
    const esperado = hourly.time.length
    for (const clave of VARIABLES_HOURLY) {
      if (hourly[clave].length !== esperado) {
        ctx.addIssue({
          code: 'custom',
          message: `hourly.${clave} tiene ${hourly[clave].length} elementos; se esperaban ${esperado} (igual que hourly.time)`,
        })
      }
    }
  })

type PayloadEcmwfElemento = z.infer<typeof payloadEcmwfElementoSchema>

type VariablesPunto = Array<{
  variable: HazardForecastPunto['variable']
  valores: Array<number | null>
  unidad: string
}>

function mapearVariables(hourly: PayloadEcmwfElemento['hourly']): VariablesPunto {
  return [
    { variable: 'precipitacion', valores: hourly.precipitation, unidad: 'mm' },
    { variable: 'cape', valores: hourly.cape, unidad: 'J/kg' },
    { variable: 'rafagas', valores: hourly.wind_gusts_10m, unidad: 'km/h' },
    { variable: 'temperatura', valores: hourly.temperature_2m, unidad: '°C' },
    { variable: 'viento', valores: hourly.wind_speed_10m, unidad: 'km/h' },
  ]
}

/** Celda resuelta de un geometryRef, lista para entrar en un lote. */
type CeldaEcmwf = { geometryRef: string; lat: number; lon: number }

/** Parsea "lat_lon" (ej. "-27.5_-58.8") a sus componentes numéricos. */
function parsearGeometryRef(geometryRef: string): { lat: number; lon: number } {
  const [latRaw, lonRaw] = geometryRef.split('_')
  const lat = Number(latRaw)
  const lon = Number(lonRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`geometryRef inválido: "${geometryRef}" (se esperaba "lat_lon")`)
  }
  return { lat, lon }
}

const FORECAST_DAYS = 10

function construirUrlLote(celdas: CeldaEcmwf[], apiKey: string | undefined): string {
  return construirUrlLoteOpenMeteo({
    subdominio: 'api',
    ruta: RUTA,
    puntos: celdas,
    queryExtra: `&hourly=${VARIABLES_HOURLY.join(',')}&forecast_days=${FORECAST_DAYS}&timezone=UTC`,
    apiKey,
  })
}

/**
 * Valida el payload de un lote. Acepta tanto el objeto suelto (una sola
 * coordenada) como el array (varias) y exige que la cantidad de objetos
 * coincida con la cantidad de coordenadas enviadas: si no, todas las celdas
 * del lote caen como `payload_invalido` en vez de quedar desalineadas.
 */
function horasEntre(desde: string, hasta: string): number {
  return Math.round((parsearTimestampUtc(hasta) - parsearTimestampUtc(desde)) / MS_POR_HORA)
}

function puntosDeCelda(
  geometryRef: string,
  hourly: PayloadEcmwfElemento['hourly'],
  ahora: Date,
): HazardForecastPunto[] {
  const { time } = hourly
  const variables = mapearVariables(hourly)
  const baseMs = ahora.getTime()
  const corridaEn = ahora.toISOString()
  const puntos: HazardForecastPunto[] = []

  for (let i = 0; i < time.length; i++) {
    const ts = time[i]
    const horizonteHoras = Math.round((parsearTimestampUtc(ts) - baseMs) / MS_POR_HORA)
    if (horizonteHoras < 0) continue

    // Paso real entre puntos consecutivos; el primero hereda el del segundo.
    const pasoCrudo =
      i === 0 ? (time.length > 1 ? horasEntre(time[0], time[1]) : 1) : horasEntre(time[i - 1], time[i])
    const pasoHoras = pasoCrudo as HazardForecastPunto['pasoHoras']

    for (const { variable, valores, unidad } of variables) {
      const valor = valores[i]
      if (valor === null || valor === undefined) continue
      puntos.push({
        variable,
        geometryRef,
        corridaEn,
        validoEn: isoUtc(ts),
        horizonteHoras,
        valor,
        unidad,
        pasoHoras,
      })
    }
  }

  return puntos
}

export type ResultadoPronosticoEcmwf = {
  puntos: HazardForecastPunto[]
  erroresPorCelda: Record<string, string>
  /** Cantidad de requests HTTP efectivamente disparadas (una por lote). */
  llamadasRealizadas: number
  /** Tamaño de cada lote, en el mismo orden en que se hicieron las llamadas. */
  celdasPorLlamada: number[]
}

export interface HazardProviderEcmwf extends HazardProvider {
  obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<ResultadoPronosticoEcmwf>
}

export function crearProviderEcmwf(opts?: {
  fetchImpl?: typeof fetch
  apiKey?: string
  /**
   * OM-cupo (opt-in): fábrica de guarda de cupo por lote, invocada con el
   * peso YA calculado del lote. Si se omite (default), este provider se
   * comporta EXACTAMENTE igual que antes de OM-cupo — sin tocar ninguna DB
   * — así los tests que no lo integran (ecmwf.test.ts) no cambian. La
   * producción la pasa desde el job (ver sync-pronostico-caudal.ts), que es
   * quien conoce el `getDb()` real.
   */
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
}): HazardProviderEcmwf {
  const fetchImpl = opts?.fetchImpl
  const apiKey = opts?.apiKey ?? apiKeyDesdeEntorno()

  async function obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<ResultadoPronosticoEcmwf> {
    const puntos: HazardForecastPunto[] = []
    const erroresPorCelda: Record<string, string> = {}
    const celdasValidas: CeldaEcmwf[] = []

    for (const geometryRef of params.geometryRefs) {
      try {
        const { lat, lon } = parsearGeometryRef(geometryRef)
        celdasValidas.push({ geometryRef, lat, lon })
      } catch (error) {
        erroresPorCelda[geometryRef] = `geometry_ref_invalido: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }

    const lotes = agruparEnLotes(celdasValidas, TAMANO_LOTE_COORDENADAS)
    const celdasPorLlamada: number[] = []

    for (let indiceLote = 0; indiceLote < lotes.length; indiceLote++) {
      const lote = lotes[indiceLote]
      const peso = pesoLlamada({ ubicaciones: lote.length, variables: VARIABLES_HOURLY.length, dias: FORECAST_DAYS })
      const cupo = opts?.controladorCupoFactory?.(peso)
      const resultado = await ejecutarConReintentos<PayloadEcmwfElemento[]>({
        url: construirUrlLote(lote, apiKey),
        fetchImpl,
        cupo,
        parsearPayload: crearParserLote(payloadEcmwfElementoSchema, lote.length),
      })

      if (!resultado.ok) {
        if (!MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) celdasPorLlamada.push(lote.length)
        const detalle = `${resultado.motivo}: ${resultado.detalle}`
        if (MOTIVOS_CORTAN_LOTES.has(resultado.motivo)) {
          // Cupo agotado en ventana larga, host en cooldown o 429 (que deja
          // la cuenta en cooldown): los lotes que faltan van a chocar
          // exactamente igual (misma guarda, mismo host). Se marcan como no consultados y se corta el loop en vez
          // de seguir golpeando la guarda lote por lote sin necesidad.
          for (const loteRestante of lotes.slice(indiceLote + 1)) {
            for (const celda of loteRestante) erroresPorCelda[celda.geometryRef] = detalle
          }
          for (const celda of lote) erroresPorCelda[celda.geometryRef] = detalle
          break
        }
        for (const celda of lote) {
          erroresPorCelda[celda.geometryRef] = detalle
        }
        continue
      }

      celdasPorLlamada.push(lote.length)
      // El array de respuesta viene en el mismo orden que las coordenadas
      // enviadas: se empareja por índice, no por el lat/lon de la respuesta.
      lote.forEach((celda, indice) => {
        puntos.push(...puntosDeCelda(celda.geometryRef, resultado.datos[indice].hourly, params.ahora))
      })
    }

    // `llamadasRealizadas` cuenta requests HTTP reales; un lote bloqueado por
    // OM-cupo (sin tocar la red) no cuenta, por eso se deriva de
    // `celdasPorLlamada.length` (que sólo crece en lotes con intento de red
    // real) y no de `lotes.length`.
    return { puntos, erroresPorCelda, llamadasRealizadas: celdasPorLlamada.length, celdasPorLlamada }
  }

  return {
    nombreProveedor: 'open-meteo-ecmwf',
    async obtenerPronostico(params) {
      const { puntos } = await obtenerPronosticoConDiagnostico(params)
      return puntos
    },
    obtenerPronosticoConDiagnostico,
  }
}
