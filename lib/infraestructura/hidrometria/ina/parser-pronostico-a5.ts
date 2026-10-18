// Parser y normalización de corridas de pronóstico INA A5
// (/sim/calibrados/{id}/corridas/last?includeProno=true). Módulo puro. Los
// qualifiers se conservan tal cual (main/p10/p90, inferior/medio/superior):
// no se derivan probabilidades ni picos diarios a partir de medias semanales.
import { z } from 'zod'
import { ErrorPayloadA5 } from './parser-a5'
import { buscarSeriePronostico, type SoportePronostico } from './series-pronostico-a5'

const fechaIso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'fecha inválida')
  .transform((v) => new Date(v).toISOString())

const CorridaSchema = z.object({
  id: z.number().int().positive(),
  cal_id: z.number().int().positive(),
  forecast_date: fechaIso,
  series: z.array(z.object({
    series_id: z.number().int().positive(),
    cor_id: z.number().int().positive(),
    metadata: z.unknown().optional(),
    pronosticos: z.array(z.object({
      timestart: fechaIso,
      timeend: fechaIso,
      valor: z.number().finite().nullable(),
      qualifier: z.string().min(1).nullable().optional().transform((v) => v ?? null),
    })),
  })),
})

export type CorridaA5 = {
  calId: number
  corId: number
  forecastDate: string
  series: { seriesId: number; pronosticos: { timestart: string; timeend: string; valor: number | null; qualifier: string | null }[] }[]
}

export function parsearCorridaA5(json: unknown, calIdEsperado: number): CorridaA5 {
  const r = CorridaSchema.safeParse(json)
  if (!r.success) throw new ErrorPayloadA5(`corrida A5 inválida: ${r.error.issues[0]?.message ?? 'formato'}`)
  const c = r.data
  if (c.cal_id !== calIdEsperado) throw new ErrorPayloadA5(`corrida de calibrado ${c.cal_id}, se esperaba ${calIdEsperado}`)
  const ajena = c.series.find((x) => x.cor_id !== c.id)
  if (ajena) throw new ErrorPayloadA5(`serie ${ajena.series_id} con cor_id ${ajena.cor_id} distinto de la corrida ${c.id}`)
  return {
    calId: c.cal_id,
    corId: c.id,
    forecastDate: c.forecast_date,
    series: c.series.map((x) => ({ seriesId: x.series_id, pronosticos: x.pronosticos })),
  }
}

export type FilaPronostico = {
  seriesId: number
  estacionId: string | null
  variable: string | null
  unidad: string | null
  soporte: SoportePronostico
  timestart: string
  timeend: string
  qualifier: string | null
  valor: number
}

export type CorridaNormalizada = {
  filas: FilaPronostico[]
  /** Filas idénticas en (serie, intervalo, qualifier): se conserva la primera. */
  repetidas: number
  sinValor: number
  /** Series que no están en SERIES_PRONOSTICO_A5: se guardan sin estación. */
  seriesDesconocidas: number[]
}

export function normalizarCorrida(corrida: CorridaA5): CorridaNormalizada {
  const filas: FilaPronostico[] = []
  const vistas = new Set<string>()
  const seriesDesconocidas: number[] = []
  let repetidas = 0
  let sinValor = 0
  for (const serie of corrida.series) {
    const meta = buscarSeriePronostico(corrida.calId, serie.seriesId)
    if (!meta && !seriesDesconocidas.includes(serie.seriesId)) seriesDesconocidas.push(serie.seriesId)
    for (const p of serie.pronosticos) {
      if (p.valor === null) {
        sinValor++
        continue
      }
      const clave = `${serie.seriesId}|${p.timestart}|${p.timeend}|${p.qualifier ?? ''}`
      if (vistas.has(clave)) {
        repetidas++
        continue
      }
      vistas.add(clave)
      filas.push({
        seriesId: serie.seriesId,
        estacionId: meta?.estacionId ?? null,
        variable: meta?.variable ?? null,
        unidad: meta?.unidad ?? null,
        soporte: meta?.soporte ?? 'desconocido',
        timestart: p.timestart,
        timeend: p.timeend,
        qualifier: p.qualifier,
        valor: p.valor,
      })
    }
  }
  return { filas, repetidas, sinValor, seriesDesconocidas }
}
