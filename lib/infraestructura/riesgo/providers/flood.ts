// Adapter de caudal (GloFAS vía Open-Meteo Flood API) para el batch de riesgo
// ENOS. A diferencia del adapter de celda, NO consulta por grilla arbitraria:
// cada geometryRef debe ser un id de PUNTOS_RIO (ver ../puntos-rio.ts), porque
// una coordenada urbana puede caer fuera de la celda del cauce y devolver un
// caudal irrelevante. La curación geográfica vive en puntos-rio.ts; acá sólo
// se resuelve id -> lat/lon y se emite el pronóstico diario.
import { z } from 'zod'
import { ejecutarConReintentos } from './cliente-http'
import { PUNTOS_RIO, puntoRioPorId, type PuntoRio } from '../puntos-rio'
import type { HazardForecastPunto, HazardProvider } from '../tipos-hazard'

const NOMBRE_PROVEEDOR = 'open-meteo-flood'
const URL_BASE = 'https://flood-api.open-meteo.com/v1/flood'
const VARIABLES_CAUDAL =
  'river_discharge,river_discharge_mean,river_discharge_max,river_discharge_p75'
const DIAS_PRONOSTICO = 10

// El contrato sólo persiste `river_discharge` como valor principal. Mean/max/p75
// llegan en el payload y quedan disponibles para la climatología de caudal
// (hazard_climatology), pero NO se emiten como HazardForecastPunto separados:
// el contrato sólo tiene un campo `valor` por punto.
const respuestaFloodSchema = z
  .object({
    daily: z.object({
      time: z.array(z.string()),
      river_discharge: z.array(z.number().nullable()),
      river_discharge_mean: z.array(z.number().nullable()).optional(),
      river_discharge_max: z.array(z.number().nullable()).optional(),
      river_discharge_p75: z.array(z.number().nullable()).optional(),
    }),
  })
  .refine((r) => r.daily.time.length === r.daily.river_discharge.length, {
    message: 'daily.time y daily.river_discharge deben tener el mismo largo',
  })

type DailyFlood = z.infer<typeof respuestaFloodSchema>['daily']

function construirUrl(punto: PuntoRio): string {
  return `${URL_BASE}?latitude=${punto.lat}&longitude=${punto.lon}&daily=${VARIABLES_CAUDAL}&forecast_days=${DIAS_PRONOSTICO}&timezone=UTC`
}

function horizonteHorasDe(fecha: string, ahora: Date): number | null {
  const inicioDia = Date.parse(`${fecha}T00:00:00Z`)
  if (!Number.isFinite(inicioDia)) return null
  return Math.round((inicioDia - ahora.getTime()) / 3_600_000)
}

function puntosDePuntoRio(daily: DailyFlood, punto: PuntoRio, ahora: Date): HazardForecastPunto[] {
  const puntos: HazardForecastPunto[] = []
  const corridaEn = ahora.toISOString()
  for (let i = 0; i < daily.time.length; i++) {
    const fecha = daily.time[i]
    const valor = daily.river_discharge[i]
    if (fecha === undefined || valor === null || valor === undefined) continue
    const horizonteHoras = horizonteHorasDe(fecha, ahora)
    if (horizonteHoras === null || horizonteHoras < 0) continue
    puntos.push({
      variable: 'caudal',
      geometryRef: punto.id,
      corridaEn,
      validoEn: `${fecha}T00:00:00Z`,
      horizonteHoras,
      valor,
      // ASCII 'm3/s' (no el símbolo ³) para evitar problemas de encoding en
      // DB/JSON.
      unidad: 'm3/s',
      // La Flood API es diaria: el paso real es 24 h. El contrato
      // HazardForecastPunto sólo declara 1|3|6 (resoluciones de modelos de
      // celda); no podemos tocar tipos-hazard.ts en este cambio, así que
      // aislamos la discrepancia en este único campo, documentada como
      // decisión de ambigüedad en el reporte del batch.
      pasoHoras: 24 as HazardForecastPunto['pasoHoras'],
    })
  }
  return puntos
}

export type ParametrosPronosticoFlood = {
  geometryRefs: string[]
  ahora: Date
  fetchImpl?: typeof fetch
}

export type DiagnosticoFlood = {
  puntos: HazardForecastPunto[]
  erroresPorCelda: Record<string, string>
}

/**
 * Igual que otros adapters de la carpeta: expone fallos por punto de consulta.
 * Un geometryRef que no matchea PUNTOS_RIO no rompe el resto del lote: se
 * ignora para la emisión y se registra con motivo 'punto_no_configurado'.
 */
export async function obtenerPronosticoConDiagnostico(
  params: ParametrosPronosticoFlood,
): Promise<DiagnosticoFlood> {
  const erroresPorCelda: Record<string, string> = {}
  const puntos: HazardForecastPunto[] = []

  // Dedupe preservando el orden: un id repetido no debe disparar dos fetch ni
  // emitir puntos duplicados.
  const ids = [...new Set(params.geometryRefs)]

  const resultados = await Promise.all(
    ids.map(async (id) => {
      const punto = puntoRioPorId(id)
      if (punto === undefined) {
        erroresPorCelda[id] = 'punto_no_configurado'
        return []
      }
      const resultado = await ejecutarConReintentos<DailyFlood>({
        url: construirUrl(punto),
        fetchImpl: params.fetchImpl,
        parsearPayload: (json) => respuestaFloodSchema.parse(json).daily,
      })
      if (!resultado.ok) {
        erroresPorCelda[id] = `${resultado.motivo}: ${resultado.detalle}`
        return []
      }
      return puntosDePuntoRio(resultado.datos, punto, params.ahora)
    }),
  )

  for (const porPunto of resultados) puntos.push(...porPunto)
  return { puntos, erroresPorCelda }
}

export function crearProviderFlood(opts?: { fetchImpl?: typeof fetch }): HazardProvider {
  return {
    nombreProveedor: NOMBRE_PROVEEDOR,
    async obtenerPronostico({ geometryRefs, ahora }) {
      const { puntos } = await obtenerPronosticoConDiagnostico({
        geometryRefs,
        ahora,
        fetchImpl: opts?.fetchImpl,
      })
      return puntos
    },
  }
}

// Reexport de conveniencia para tests/consumidores que quieran enumerar los
// puntos configurados sin importar puntos-rio.ts por separado.
export { PUNTOS_RIO }
