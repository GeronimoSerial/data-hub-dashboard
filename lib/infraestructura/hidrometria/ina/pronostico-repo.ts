// Persistencia y lectura de corridas de pronóstico INA A5 (hidro_ina_corrida,
// hidro_ina_pronostico) con su lote crudo en hidro_lote_crudo. La identidad de
// una emisión es (cal_id, cor_id): volver a descargarla no guarda nada nuevo
// ni cambia su forecast_date. "Más nueva" se decide por forecast_date, nunca
// por fecha de descarga.
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { hidroInaCorrida, hidroInaPronostico, hidroLoteCrudo } from '@/lib/db/schema'
import type { FilaPronostico } from './parser-pronostico-a5'
import type { SoportePronostico } from './series-pronostico-a5'

type Db = ReturnType<typeof getDb>

export const FUENTE_INA_A5_CALIBRADO = 'ina-a5-calibrado'

export type LoteCorridaIna = {
  calId: number
  corId: number
  forecastDate: string
  url: string
  payload: unknown
  sha256: string
  descargadoEn: string
  filas: readonly FilaPronostico[]
}

export async function guardarCorridaIna(db: Db, lote: LoteCorridaIna): Promise<{ nueva: boolean; insertadas: number }> {
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ corId: hidroInaCorrida.corId })
      .from(hidroInaCorrida)
      .where(and(eq(hidroInaCorrida.calId, lote.calId), eq(hidroInaCorrida.corId, lote.corId)))
    if (existente) return { nueva: false, insertadas: 0 }

    // hidro_lote_crudo.serie_id guarda el cal_id para lotes de calibrado.
    await tx
      .insert(hidroLoteCrudo)
      .values({ sha256: lote.sha256, fuente: FUENTE_INA_A5_CALIBRADO, url: lote.url, serieId: lote.calId, payload: lote.payload, descargadoEn: lote.descargadoEn })
      .onConflictDoNothing()
    const insertada = await tx
      .insert(hidroInaCorrida)
      .values({ calId: lote.calId, corId: lote.corId, forecastDate: lote.forecastDate, descargadoEn: lote.descargadoEn, loteSha256: lote.sha256 })
      .onConflictDoNothing()
      .returning({ corId: hidroInaCorrida.corId })
    if (insertada.length === 0) return { nueva: false, insertadas: 0 }
    if (lote.filas.length === 0) return { nueva: true, insertadas: 0 }

    const filas = await tx
      .insert(hidroInaPronostico)
      .values(lote.filas.map((f) => ({ calId: lote.calId, corId: lote.corId, ...f })))
      .onConflictDoNothing()
      .returning({ seriesId: hidroInaPronostico.seriesId })
    return { nueva: true, insertadas: filas.length }
  })
}

export type ValorPronosticoIna = {
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

export type CorridaInaGuardada = {
  calId: number
  corId: number
  forecastDate: string
  descargadoEn: string
  valores: ValorPronosticoIna[]
}

/**
 * Última corrida del calibrado emitida hasta `asOf` (ISO) inclusive, con sus
 * valores. Las corridas con forecast_date posterior a `asOf` nunca se devuelven.
 */
export async function leerUltimaCorridaIna(db: Db, calId: number, asOf: string): Promise<CorridaInaGuardada | null> {
  if (Number.isNaN(Date.parse(asOf))) throw new Error('asOf debe ser una fecha ISO')
  const corte = new Date(asOf).toISOString()
  const [corrida] = await db
    .select()
    .from(hidroInaCorrida)
    .where(and(eq(hidroInaCorrida.calId, calId), lte(hidroInaCorrida.forecastDate, corte)))
    .orderBy(desc(hidroInaCorrida.forecastDate), desc(hidroInaCorrida.corId))
    .limit(1)
  if (!corrida) return null
  const valores = await db
    .select({
      seriesId: hidroInaPronostico.seriesId,
      estacionId: hidroInaPronostico.estacionId,
      variable: hidroInaPronostico.variable,
      unidad: hidroInaPronostico.unidad,
      soporte: hidroInaPronostico.soporte,
      timestart: hidroInaPronostico.timestart,
      timeend: hidroInaPronostico.timeend,
      qualifier: hidroInaPronostico.qualifier,
      valor: hidroInaPronostico.valor,
    })
    .from(hidroInaPronostico)
    .where(and(eq(hidroInaPronostico.calId, calId), eq(hidroInaPronostico.corId, corrida.corId)))
    .orderBy(asc(hidroInaPronostico.seriesId), asc(hidroInaPronostico.timestart), asc(hidroInaPronostico.qualifier))
  return {
    calId: corrida.calId,
    corId: corrida.corId,
    forecastDate: corrida.forecastDate,
    descargadoEn: corrida.descargadoEn,
    valores: valores.map((v) => ({ ...v, soporte: v.soporte as SoportePronostico })),
  }
}
