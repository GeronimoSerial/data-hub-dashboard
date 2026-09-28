import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

// Test de integración real (sin mocks, DB real PGlite, sin red): protege la
// misma garantía de E8 (docs/ejecucion-enos/E8/revision-3.md, Tarea 3c) que
// cubría el viejo scripts/jobs.migracion-legacy.test.ts, adaptada al motor
// actual. `scripts/jobs.mjs` es el timer systemd de producción: su dispatch
// llama `ensureSeeded()` -> `migrarDb()` ANTES de tocar la base, así que un job
// programado NUNCA asume que el esquema ya está al día.
//
// El test viejo reproducía el bug contra SQLite con una base "legacy" a la que
// le faltaba una columna (`auditoria_fallback` de infra_briefing). Con
// Postgres/F2 ese escenario ya no aplica: las migraciones versionadas de
// drizzle-kit llevan su propia tabla de control y no re-ejecutan una migración
// ya aplicada, así que un `ALTER TABLE DROP COLUMN` no lo desharía. El
// equivalente real es una base PGlite COMPLETAMENTE sin migrar (ni la tabla de
// control de drizzle ni ninguna tabla del schema): si el job no migrara antes
// de despachar, cualquier consulta fallaría con
// `relation "infra_situacion_corte" does not exist`.
//
// NOTA de por qué hay dos invocaciones a correrJob: sobre una base sin migrar
// no puede preexistir un corte (la propia migración crea la tabla de cortes).
// Por eso la PRIMERA corrida prueba la migración sobre la base vacía y la
// SEGUNDA, ya con la tabla migrada y el corte sembrado (igual que el test
// viejo), prueba la persistencia del briefing.
describe('jobs.mjs — migración del esquema antes de despachar', () => {
  it('correrJob("briefing-ia") migra una base PGlite sin migrar y persiste el briefing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'jobs-migracion-legacy-'))
    const dataDirPrevio = process.env.DATA_DIR
    const pgliteDirPrevio = process.env.PGLITE_DATA_DIR
    const databaseUrlPrevio = process.env.DATABASE_URL
    const presupuestoPrevio = process.env.E8_PRESUPUESTO_USD_MES
    const jobsEnabledPrevio = process.env.ENOS_JOBS_ENABLED

    try {
      process.env.DATA_DIR = dir
      // PGlite PERSISTIDA en un directorio propio (ver el comentario de
      // PGLITE_DATA_DIR en lib/db/index.ts): la base "sin migrar" que ve este
      // proceso es un estado real en disco, no una PGlite en memoria.
      process.env.PGLITE_DATA_DIR = path.join(dir, 'pg')
      // Sin DATABASE_URL el driver resuelto es 'pglite' (lib/db/driver.ts). Se
      // borra explícito para que un runner con Postgres configurado no mande
      // este test contra una base real.
      delete process.env.DATABASE_URL
      // 0.001 < la reserva por defecto (0.01): reservarPresupuesto falla ANTES
      // de cualquier llamada de red y el briefing sale por la plantilla.
      process.env.E8_PRESUPUESTO_USD_MES = '0.001'
      // El flag maestro de jobs debe estar activo para llegar al dispatch real;
      // se fija explícito para no depender del entorno ambiente del runner.
      process.env.ENOS_JOBS_ENABLED = 'true'

      // Módulos frescos: nada de una conexión `_db`/`seedPromise` memoizada por
      // otro test que pudiera haber migrado ya esta base.
      vi.resetModules()
      const { correrJob } = await import('./jobs.mjs')
      const { getDb, getRawClient } = await import('@/lib/db')
      const { infraSituacionCorte, infraBriefing } = await import('@/lib/db/schema')
      const { crearEjecutorSql } = await import('@/lib/infraestructura/ge-db')

      const db = getDb()
      const ejecutor = crearEjecutorSql(getRawClient())

      // Estado inicial: la base NO está migrada. `getDb()` sólo abre la
      // conexión y PGlite inicializa su catálogo, nunca las tablas del hub.
      const tablasAntes = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
      expect(tablasAntes.rows).toHaveLength(0)
      const controlDrizzleAntes = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'",
      )
      expect(controlDrizzleAntes.rows).toHaveLength(0)

      // (a) Primera invocación por la MISMA vía del timer (import de
      // './jobs.mjs'): sobre la base vacía todavía no hay corte, así que el
      // resultado es 'sin_corte_disponible'. Lo que importa es que NO lanza:
      // sin la migración previa a dispatch esto sería
      // `relation "infra_situacion_corte" does not exist`.
      const sinCorte = (await correrJob('briefing-ia')) as {
        ejecutado: boolean
        motivo: string
      }
      expect(sinCorte).toEqual({ ejecutado: false, motivo: 'sin_corte_disponible' })

      // (b) Después de correrlo, las tablas del schema existen (consultadas por
      // information_schema) y un select sobre una tabla clave funciona.
      const tablasDespues = await ejecutor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
      const nombres = tablasDespues.rows.map((r) => String(r.table_name))
      expect(nombres).toContain('infra_situacion_corte')
      expect(nombres).toContain('infra_briefing')
      await expect(db.select().from(infraSituacionCorte)).resolves.toEqual([])

      // (c) Corte real para que el job tenga algo que briefar, igual que el
      // test viejo. Se siembra sobre la base que el propio correrJob migró.
      const generadoEn = new Date().toISOString()
      await db.insert(infraSituacionCorte).values({
        id: 'corte-legacy-1',
        generadoEn,
        riskRunId: null,
        cobertura: null,
        conteosPorNivelRiesgo: {},
        kpis: {
          escuelasAfectacionConfirmadaVigente: 0,
          escuelasRiesgoAlto24h: 0,
          fuentesVencidas: 0,
        },
        fuentesSalud: [],
        episodiosAbiertos: 0,
        episodiosCerradosDesdeAnterior: 0,
        generadoPorJobRunId: null,
        creadaEn: generadoEn,
      })

      const resultado = (await correrJob('briefing-ia')) as {
        ejecutado: boolean
        fuente: string
      }
      expect(resultado.ejecutado).toBe(true)
      expect(resultado.fuente).toBe('plantilla')

      const filas = await db
        .select()
        .from(infraBriefing)
        .where(eq(infraBriefing.corteId, 'corte-legacy-1'))
      expect(filas).toHaveLength(1)
      expect(filas[0]?.fuente).toBe('plantilla')
    } finally {
      vi.resetModules()
      if (dataDirPrevio === undefined) delete process.env.DATA_DIR
      else process.env.DATA_DIR = dataDirPrevio
      if (pgliteDirPrevio === undefined) delete process.env.PGLITE_DATA_DIR
      else process.env.PGLITE_DATA_DIR = pgliteDirPrevio
      if (databaseUrlPrevio === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = databaseUrlPrevio
      if (presupuestoPrevio === undefined) delete process.env.E8_PRESUPUESTO_USD_MES
      else process.env.E8_PRESUPUESTO_USD_MES = presupuestoPrevio
      if (jobsEnabledPrevio === undefined) delete process.env.ENOS_JOBS_ENABLED
      else process.env.ENOS_JOBS_ENABLED = jobsEnabledPrevio
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
