import { describe, expect, it } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { __resetGuardCacheForTests, crearEjecutorSql, ensureGeSchema } from './ge-db'

// Pruebas de concurrencia contra Postgres real. Cada llamada usa su propio
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

function nombreBaseTemporal(): string {
  return `ge_guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

describe.skipIf(!DB_URL)('ensureGeSchema sobre Postgres real', () => {
  it('12 llamadas concurrentes desde conexiones distintas en una base fresca no fallan', async () => {
    const admin = new Pool({ connectionString: DB_URL, max: 1 })
    const nombre = nombreBaseTemporal()
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

describe.skipIf(!DB_URL)('guard de elegibilidad sobre Postgres real: memoización y cuerpo', () => {
  it('crea la función una sola vez con llamadas en paralelo y restaura el cuerpo editado a mano', async () => {
    const admin = new Pool({ connectionString: DB_URL, max: 1 })
    const nombre = nombreBaseTemporal()
    await admin.query(`CREATE DATABASE "${nombre}"`)
    const url = urlDeBase(DB_URL!, nombre)
    const setup = new Pool({ connectionString: url, max: 2 })
    const pool = new Pool({ connectionString: url, max: 12 })
    try {
      // Cuenta las creaciones de la función que salen por conexiones reservadas
      // (la transacción dedicada del bootstrap usa pool.connect()). Cada cliente
      // del pool se envuelve una sola vez: las conexiones se reciclan.
      let creaciones = 0
      const envueltas = new WeakSet<PoolClient>()
      const conectarOriginal = pool.connect.bind(pool) as unknown as () => Promise<PoolClient>
      pool.connect = (async () => {
        const conexion = await conectarOriginal()
        if (!envueltas.has(conexion)) {
          envueltas.add(conexion)
          const consultaOriginal = conexion.query.bind(conexion) as (...args: unknown[]) => unknown
          conexion.query = ((texto: string, ...resto: unknown[]) => {
            if (texto.includes('CREATE OR REPLACE FUNCTION')) creaciones++
            return consultaOriginal(texto, ...resto)
          }) as typeof conexion.query
        }
        return conexion
      }) as unknown as typeof pool.connect

      const ejecutor = crearEjecutorSql(pool)
      __resetGuardCacheForTests(ejecutor)
      await Promise.all(Array.from({ length: 12 }, () => ensureGeSchema(ejecutor)))
      expect(creaciones).toBe(1)

      await ensureGeSchema(ejecutor)
      expect(creaciones).toBe(1)

      await setup.query(
        "CREATE OR REPLACE FUNCTION public.booklet_eligibility_source_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$",
      )
      __resetGuardCacheForTests(ejecutor)
      creaciones = 0
      await ensureGeSchema(ejecutor)
      expect(creaciones).toBe(1)

      const res = await setup.query(
        "SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'booklet_eligibility_source_write_guard'",
      )
      expect(String(res.rows[0].prosrc)).toContain('pg_advisory_xact_lock')
    } finally {
      await pool.end()
      await setup.end()
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
      await admin.end()
    }
  }, 120_000)
})
