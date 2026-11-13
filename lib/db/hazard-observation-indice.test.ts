import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'

usarDbTemporal('hazard-obs-idx-')

const INDICE = 'hazard_observation_provider_variable_observado_idx'
const CONSULTA = `SELECT DISTINCT observado_en FROM hazard_observation
  WHERE provider = 'nasa-imerg' AND variable = 'precipitacion_observada_satelital'
  AND observado_en BETWEEN '2026-10-28T00:00:00.000Z' AND '2026-10-31T00:00:00.000Z'`

async function filas(texto: string): Promise<Record<string, unknown>[]> {
  const db = await getDb()
  const res: unknown = await db.execute(sql.raw(texto))
  const conRows = res as { rows?: Record<string, unknown>[] }
  return conRows.rows ?? (res as Record<string, unknown>[])
}

async function plan(): Promise<string> {
  const r = await filas(`EXPLAIN ${CONSULTA}`)
  return r.map((fila) => String(fila['QUERY PLAN'])).join('\n')
}

describe('índice hazard_observation (provider, variable, observado_en)', () => {
  beforeAll(async () => {
    // 150 celdas x 600 gránulos de 30 min ≈ 90k filas IMERG, más otro proveedor.
    await filas(`INSERT INTO hazard_observation
      (id, provider, variable, geometry_ref, valor, unidad, observado_en, valido_desde, valido_hasta, ingerido_en)
      SELECT 'i-' || c || '-' || t, 'nasa-imerg', 'precipitacion_observada_satelital', 'c' || c, 1, 'mm/h',
        to_char(timestamp '2026-10-20 00:00:00' + t * interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
        '', '', ''
      FROM generate_series(1, 150) c, generate_series(0, 599) t`)
    await filas(`INSERT INTO hazard_observation
      (id, provider, variable, geometry_ref, valor, unidad, observado_en, valido_desde, valido_hasta, ingerido_en)
      SELECT 'o-' || c || '-' || t, 'otro', 'x', 'c' || c, 1, 'mm', '2026-10-29T00:' || lpad(t::text, 2, '0') || ':00.000Z', '', '', ''
      FROM generate_series(1, 20) c, generate_series(0, 49) t`)
    await filas('ANALYZE hazard_observation')
  })

  it('existe tras migrar y es un índice btree (provider, variable, observado_en)', async () => {
    const r = await filas(`SELECT indexdef FROM pg_indexes
      WHERE tablename = 'hazard_observation' AND indexname = '${INDICE}'`)
    expect(r).toHaveLength(1)
    expect(String(r[0].indexdef)).toContain('(provider, variable, observado_en)')
  })

  it('el planner usa el índice nuevo y no recorre el índice único del proveedor', async () => {
    const usado = await plan()
    expect(usado).toContain(INDICE)
    expect(usado).not.toContain('hazard_observation_uidx')
  })

  it('sin el índice nuevo el rango cae al índice único / seq scan (control)', async () => {
    await filas(`DROP INDEX ${INDICE}`)
    try {
      const sinIndice = await plan()
      expect(sinIndice).not.toContain(INDICE)
      expect(sinIndice).toMatch(/hazard_observation_uidx|Seq Scan/)
    } finally {
      await filas(`CREATE INDEX ${INDICE} ON hazard_observation (provider, variable, observado_en)`)
    }
  })
})
