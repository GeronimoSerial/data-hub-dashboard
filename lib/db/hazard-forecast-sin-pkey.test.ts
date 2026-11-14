import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'

usarDbTemporal('hazard-forecast-pkey-')

async function filas(texto: string): Promise<Record<string, unknown>[]> {
  const db = await getDb()
  const res: unknown = await db.execute(sql.raw(texto))
  const conRows = res as { rows?: Record<string, unknown>[] }
  return conRows.rows ?? (res as Record<string, unknown>[])
}

const UPSERT = (id: string, valor: number) => `INSERT INTO hazard_forecast
  (id, provider, variable, geometry_ref, corrida_en, valido_en, horizonte_horas, valor, unidad, paso_horas, ingerido_en)
  VALUES ('${id}', 'open-meteo-ecmwf', 'precipitacion', 'c1', '2026-11-14T00:00:00.000Z',
    '2026-11-14T06:00:00.000Z', 6, ${valor}, 'mm', 1, '2026-11-14T00:05:00.000Z')
  ON CONFLICT (provider, variable, geometry_ref, corrida_en, valido_en)
  DO UPDATE SET valor = excluded.valor, unidad = excluded.unidad,
    paso_horas = excluded.paso_horas, ingerido_en = excluded.ingerido_en`

describe('hazard_forecast sin clave primaria (migración 0061)', () => {
  it('la tabla ya no tiene la restricción hazard_forecast_pkey ni su índice', async () => {
    const restricciones = await filas(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'hazard_forecast'::regclass AND contype = 'p'`)
    expect(restricciones).toHaveLength(0)
    const indices = await filas(`SELECT indexname FROM pg_indexes
      WHERE tablename = 'hazard_forecast' AND indexname = 'hazard_forecast_pkey'`)
    expect(indices).toHaveLength(0)
  })

  it('el índice único de 5 columnas sigue presente', async () => {
    const r = await filas(`SELECT indexdef FROM pg_indexes
      WHERE tablename = 'hazard_forecast' AND indexname = 'hazard_forecast_uidx'`)
    expect(r).toHaveLength(1)
    expect(String(r[0].indexdef)).toContain(
      '(provider, variable, geometry_ref, corrida_en, valido_en)',
    )
  })

  it('id sigue siendo NOT NULL', async () => {
    const r = await filas(`SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'hazard_forecast' AND column_name = 'id'`)
    expect(r).toEqual([{ is_nullable: 'NO' }])
  })

  it('el upsert ON CONFLICT de 5 columnas inserta y luego actualiza sin duplicar', async () => {
    await filas(UPSERT('a', 1))
    await filas(UPSERT('b', 2))
    const r = await filas(`SELECT id, valor FROM hazard_forecast WHERE provider = 'open-meteo-ecmwf'`)
    expect(r).toHaveLength(1)
    expect(Number(r[0].valor)).toBe(2)
  })

  it('UPDATE y DELETE por columnas de negocio funcionan (la purga de retención no depende de id)', async () => {
    await filas(`DELETE FROM hazard_forecast WHERE corrida_en < '2026-12-01T00:00:00.000Z'`)
    const r = await filas(`SELECT count(*)::int AS n FROM hazard_forecast`)
    expect(r[0].n).toBe(0)
  })
})
