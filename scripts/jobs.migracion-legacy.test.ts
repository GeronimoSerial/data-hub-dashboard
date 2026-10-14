import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

// Test de integración real (sin mocks, DB real PGlite, sin red): protege una
// garantía general de `scripts/jobs.mjs`: su dispatch llama `ensureSeeded()` ->
// `migrarDb()` ANTES de tocar la base, así que un job programado NUNCA asume que
// el esquema ya está al día. Lo cubría el caso de `briefing-ia` (E8); al retirar
// E8 se porta al job que lo reemplaza, `veredicto-diario`.
//
// El escenario es una base PGlite COMPLETAMENTE sin migrar (ni la tabla de
// control de drizzle ni ninguna tabla del schema): si el job no migrara antes de
// despachar, la primera consulta fallaría con
// `relation "hazard_observation" does not exist`.
//
// La IA queda deshabilitada por presupuesto: con un techo mensual menor que la
// reserva por llamada, `reservarPresupuestoMes` falla ANTES de cualquier red y
// todos los veredictos salen por la plantilla determinista.
describe('jobs.mjs — migración del esquema antes de despachar', () => {
  it('correrJob("veredicto-diario") migra una base PGlite sin migrar y persiste veredictos por plantilla', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'jobs-migracion-legacy-'))
    const previos = {
      DATA_DIR: process.env.DATA_DIR,
      PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
      DATABASE_URL: process.env.DATABASE_URL,
      VEREDICTO_PRESUPUESTO_USD_MES: process.env.VEREDICTO_PRESUPUESTO_USD_MES,
      ENOS_JOBS_ENABLED: process.env.ENOS_JOBS_ENABLED,
      AI_VEREDICTO_ENABLED: process.env.AI_VEREDICTO_ENABLED,
    }

    try {
      process.env.DATA_DIR = dir
      // PGlite PERSISTIDA en un directorio propio (ver PGLITE_DATA_DIR en
      // lib/db/index.ts): la base "sin migrar" es un estado real en disco.
      process.env.PGLITE_DATA_DIR = path.join(dir, 'pg')
      // Sin DATABASE_URL el driver resuelto es 'pglite'. Se borra explícito para
      // que un runner con Postgres configurado no mande el test a una base real.
      delete process.env.DATABASE_URL
      // 0.001 < la reserva por defecto (0.02): sin llamada de red, sale plantilla.
      process.env.VEREDICTO_PRESUPUESTO_USD_MES = '0.001'
      // Flags necesarios para llegar al dispatch real, fijados explícitos.
      process.env.ENOS_JOBS_ENABLED = 'true'
      process.env.AI_VEREDICTO_ENABLED = 'true'

      // Módulos frescos: nada de una conexión o seed memoizados por otro test.
      vi.resetModules()
      const { correrJob } = await import('./jobs.mjs')
      const { getDb, getRawClient } = await import('@/lib/db')
      const { infraVeredictoDia } = await import('@/lib/db/schema')
      const { crearEjecutorSql } = await import('@/lib/infraestructura/ge-db')

      const db = getDb()
      const ejecutor = crearEjecutorSql(getRawClient())

      // Estado inicial: la base NO está migrada.
      const tablasAntes = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
      expect(tablasAntes.rows).toHaveLength(0)
      const controlDrizzleAntes = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'",
      )
      expect(controlDrizzleAntes.rows).toHaveLength(0)

      // Invocación por la MISMA vía del scheduler (import de './jobs.mjs').
      const resultado = (await correrJob('veredicto-diario')) as {
        ejecutado: boolean
        resultado: { insertados: number; fuenteIa: number; fuentePlantilla: number; motivoFallback: string | null }
      }
      expect(resultado.ejecutado).toBe(true)
      expect(resultado.resultado.insertados).toBeGreaterThan(0)
      expect(resultado.resultado.fuenteIa).toBe(0)
      expect(resultado.resultado.fuentePlantilla).toBe(resultado.resultado.insertados)
      expect(resultado.resultado.motivoFallback).toBe('presupuesto_agotado')

      // Las tablas del schema existen después de correrlo.
      const tablasDespues = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
      const nombres = tablasDespues.rows.map((r) => String(r.table_name))
      expect(nombres).toContain('hazard_observation')
      expect(nombres).toContain('infra_veredicto_dia')

      const filas = await db.select().from(infraVeredictoDia).where(eq(infraVeredictoDia.ambito, 'provincia'))
      expect(filas.length).toBeGreaterThan(0)
      expect(filas.every((f) => f.fuente === 'plantilla' && f.nivel === 'sin_dato')).toBe(true)
    } finally {
      vi.resetModules()
      for (const [clave, valor] of Object.entries(previos)) {
        if (valor === undefined) delete process.env[clave]
        else process.env[clave] = valor
      }
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
