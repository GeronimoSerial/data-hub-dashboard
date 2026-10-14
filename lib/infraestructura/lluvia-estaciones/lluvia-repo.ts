import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { lluviaEstacion } from '@/lib/db/schema'
import type { PrecipitacionSynop } from './synop-parser'

type Db = ReturnType<typeof getDb>

// Mantiene cada INSERT por debajo del límite de parámetros de Postgres.
const TAMANO_LOTE = 500

type ClaveMedicion = Pick<PrecipitacionSynop, 'estacionWmo' | 'observadoEn' | 'periodoHoras' | 'seccion'>

function claveDe(registro: ClaveMedicion): string {
  return [registro.estacionWmo, registro.observadoEn, registro.periodoHoras, registro.seccion].join('|')
}

/**
 * Upsert idempotente por (estación, observado_en, periodo, sección). Una medición
 * ya guardada se actualiza (precipitación, traza y captura) en lugar de duplicarse.
 * Devuelve la cantidad de registros procesados tras eliminar duplicados del lote.
 */
export async function guardarLluviaSynop(
  db: Db,
  registros: readonly PrecipitacionSynop[],
  capturadaEn: string,
): Promise<number> {
  // ON CONFLICT no admite dos filas con la misma clave en un mismo INSERT: la última gana.
  const unicos = [...new Map(registros.map((r) => [claveDe(r), r])).values()]

  for (let inicio = 0; inicio < unicos.length; inicio += TAMANO_LOTE) {
    const lote = unicos.slice(inicio, inicio + TAMANO_LOTE).map((r) => ({
      id: randomUUID(),
      estacionWmo: r.estacionWmo,
      observadoEn: r.observadoEn,
      periodoHoras: r.periodoHoras,
      seccion: r.seccion,
      precipitacionMm: r.precipitacionMm,
      traza: r.traza,
      capturadaEn,
    }))

    await db
      .insert(lluviaEstacion)
      .values(lote)
      .onConflictDoUpdate({
        target: [
          lluviaEstacion.estacionWmo,
          lluviaEstacion.observadoEn,
          lluviaEstacion.periodoHoras,
          lluviaEstacion.seccion,
        ],
        set: {
          precipitacionMm: sql`excluded.precipitacion_mm`,
          traza: sql`excluded.traza`,
          capturadaEn: sql`excluded.capturada_en`,
        },
      })
  }

  return unicos.length
}

/** Mediciones de una estación entre `desde` y `hasta` (ISO UTC, inclusive), por fin de período. */
export async function obtenerLluviaSynop(
  db: Db,
  params: { estacionWmo: string; desde: string; hasta: string },
): Promise<PrecipitacionSynop[]> {
  const filas = await db
    .select()
    .from(lluviaEstacion)
    .where(
      and(
        eq(lluviaEstacion.estacionWmo, params.estacionWmo),
        gte(lluviaEstacion.observadoEn, params.desde),
        lte(lluviaEstacion.observadoEn, params.hasta),
      ),
    )
    .orderBy(asc(lluviaEstacion.observadoEn), asc(lluviaEstacion.seccion))

  return filas.map((f) => ({
    estacionWmo: f.estacionWmo,
    observadoEn: f.observadoEn,
    periodoHoras: f.periodoHoras,
    precipitacionMm: f.precipitacionMm,
    traza: f.traza,
    seccion: f.seccion === 3 ? 3 : 1,
  }))
}
