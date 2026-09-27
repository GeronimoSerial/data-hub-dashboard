// Adapter del proveedor ECMWF vía Open-Meteo. Traduce la respuesta horaria del
// endpoint `/v1/ecmwf` al contrato `HazardForecastPunto` del dominio.
//
// Decisiones clave:
// - Cada celda (geometryRef) se resuelve con `ejecutarConReintentos`, que ya
//   aporta timeout/backoff/429/cuarentena. Un fallo en una celda no tumba al
//   resto: `obtenerPronosticoConDiagnostico` acumula el motivo por celda y
//   devuelve los puntos de las celdas que sí respondieron.
// - El paso horario NO es fijo: Open-Meteo entrega 1h, 3h y 6h según el
//   horizonte, así que se deriva de la diferencia real entre timestamps
//   consecutivos (primer punto usa el paso del segundo respecto al primero).
import { z } from 'zod'
import { ejecutarConReintentos } from './cliente-http'
import type { HazardForecastPunto, HazardProvider } from '../tipos-hazard'

const BASE_URL = 'https://api.open-meteo.com/v1/ecmwf'
const VARIABLES_HOURLY = [
  'precipitation',
  'cape',
  'wind_gusts_10m',
  'temperature_2m',
  'wind_speed_10m',
] as const
const MS_POR_HORA = 3_600_000

// Open-Meteo puede devolver nulls en el borde del horizonte: se modelan como
// nullable y luego se descartan punto a punto (NO se convierten a 0).
const serieNumerica = z.array(z.number().nullable())

const payloadEcmwfSchema = z
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

type PayloadEcmwf = z.infer<typeof payloadEcmwfSchema>

type VariablesPunto = Array<{
  variable: HazardForecastPunto['variable']
  valores: Array<number | null>
  unidad: string
}>

function mapearVariables(hourly: PayloadEcmwf['hourly']): VariablesPunto {
  return [
    { variable: 'precipitacion', valores: hourly.precipitation, unidad: 'mm' },
    { variable: 'cape', valores: hourly.cape, unidad: 'J/kg' },
    { variable: 'rafagas', valores: hourly.wind_gusts_10m, unidad: 'km/h' },
    { variable: 'temperatura', valores: hourly.temperature_2m, unidad: '°C' },
    { variable: 'viento', valores: hourly.wind_speed_10m, unidad: 'km/h' },
  ]
}

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

function construirUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: VARIABLES_HOURLY.join(','),
    forecast_days: '10',
    timezone: 'UTC',
  })
  return `${BASE_URL}?${params.toString()}`
}

/** Interpreta el timestamp de Open-Meteo como UTC (viene sin sufijo 'Z'). */
function parsearTimestampUtc(ts: string): number {
  return Date.parse(ts.includes('Z') || ts.includes('+') ? ts : `${ts}Z`)
}

function isoUtc(ts: string): string {
  return ts.includes('Z') || ts.includes('+') ? ts : `${ts}Z`
}

function horasEntre(desde: string, hasta: string): number {
  return Math.round((parsearTimestampUtc(hasta) - parsearTimestampUtc(desde)) / MS_POR_HORA)
}

function puntosDeCelda(
  geometryRef: string,
  hourly: PayloadEcmwf['hourly'],
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
}

export interface HazardProviderEcmwf extends HazardProvider {
  obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<ResultadoPronosticoEcmwf>
}

export function crearProviderEcmwf(opts?: { fetchImpl?: typeof fetch }): HazardProviderEcmwf {
  const fetchImpl = opts?.fetchImpl

  async function obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<ResultadoPronosticoEcmwf> {
    const puntos: HazardForecastPunto[] = []
    const erroresPorCelda: Record<string, string> = {}

    for (const geometryRef of params.geometryRefs) {
      let url: string
      try {
        const { lat, lon } = parsearGeometryRef(geometryRef)
        url = construirUrl(lat, lon)
      } catch (error) {
        erroresPorCelda[geometryRef] = `geometry_ref_invalido: ${
          error instanceof Error ? error.message : String(error)
        }`
        continue
      }

      const resultado = await ejecutarConReintentos<PayloadEcmwf>({
        url,
        fetchImpl,
        parsearPayload: (json) => payloadEcmwfSchema.parse(json),
      })

      if (!resultado.ok) {
        erroresPorCelda[geometryRef] = `${resultado.motivo}: ${resultado.detalle}`
        continue
      }

      puntos.push(...puntosDeCelda(geometryRef, resultado.datos.hourly, params.ahora))
    }

    return { puntos, erroresPorCelda }
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
