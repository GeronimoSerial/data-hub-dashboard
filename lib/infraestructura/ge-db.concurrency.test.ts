import { describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'

// Prueba de concurrencia contra Postgres real. Cada llamada usa su propio
// pg.Pool (identidad de cliente distinta), así la memoización por proceso no
// oculta la carrera entre conexiones: sólo queda el lock de base de datos.
// Se ejecuta con GE_DB_TEST_DATABASE_URL apuntando a un servidor Postgres de
// prueba; cada corrida crea y borra una base propia.
const DB_URL = process.env.GE_DB_TEST_DATABASE_URL

function urlDeBase(base: string, nombre: string): string {
  const url = new URL(base)
  url.pathname = `/${nombre}`
  return url.toString()
}

describe.skipIf(!DB_URL)('ensureGeSchema sobre Postgres real', () => {
  it('12 llamadas concurrentes desde conexiones distintas en una base fresca no fallan', async () => {
    const admin = new Pool({ connectionString: DB_URL, max: 1 })
    const nombre = `ge_guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await admin.query(`CREATE DATABASE "${nombre}"`)
    const pools: Pool[] = []
    try {
      for (let i = 0; i < 12; i++) {
        pools.push(new Pool({ connectionString: urlDeBase(DB_URL!, nombre), max: 2 }))
      }
      const resultados = await Promise.allSettled(
        pools.map((pool) => ensureGeSchema(crearEjecutorSql(pool))),
      )
      const errores = resultados
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => String(r.reason))
      expect(errores).toEqual([])

      const fn = await pools[0].query(
        "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'booklet_eligibility_source_write_guard'",
      )
      expect(fn.rows[0].n).toBe(1)
    } finally {
      await Promise.all(pools.map((pool) => pool.end()))
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
      await admin.end()
    }
  }, 120_000)
})
