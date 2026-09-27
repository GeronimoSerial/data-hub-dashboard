import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Test de integración real (sin mocks, DB real, sin red): reproduce el bug de
// migración de docs/ejecucion-enos/E8/revision-3.md (Tarea 3c) por la MISMA vía
// que usa el timer systemd en producción (scripts/jobs.mjs -> job.ts), sin
// pasar por ninguna ruta web que dispare ensureSeeded().
describe('jobs.mjs — migración de base legacy antes de despachar', () => {
  it('correrJob("briefing-ia") migra el esquema y persiste el briefing sobre una infra_briefing sin auditoria_fallback', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'jobs-legacy-'))
    const dataDirPrevio = process.env.DATA_DIR
    const presupuestoPrevio = process.env.E8_PRESUPUESTO_USD_MES
    const jobsEnabledPrevio = process.env.ENOS_JOBS_ENABLED

    try {
      process.env.DATA_DIR = dir
      process.env.E8_PRESUPUESTO_USD_MES = '0.001'
      // El flag maestro de jobs debe estar activo para llegar al dispatch real;
      // se fija explícito para no depender del entorno ambiente del runner.
      process.env.ENOS_JOBS_ENABLED = 'true'

      // Esquema COMPLETO y actual (incluye infra_briefing con
      // auditoria_fallback), como lo deja una instalación al día.
      vi.resetModules()
      const { ensureSeeded } = await import('../lib/db/seed')
      await ensureSeeded()

      // Se retrocede la base al estado legacy: infra_briefing sin la columna.
      const { getDb } = await import('../lib/db')
      const db = getDb()
      await db.$client.execute('ALTER TABLE infra_briefing DROP COLUMN auditoria_fallback')

      // Corte real para que el job tenga algo que briefar.
      const { infraSituacionCorte } = await import('../lib/db/schema')
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

      // Módulos frescos para que scripts/jobs.mjs y su cadena de imports tomen
      // el DATA_DIR ya seteado, sin una conexión memoizada vieja.
      vi.resetModules()
      const { correrJob } = await import('./jobs.mjs')

      // Antes del fix esto tiraba
      // 'SQLITE_ERROR: table infra_briefing has no column named auditoria_fallback'.
      const resultado = (await correrJob('briefing-ia')) as {
        ejecutado: boolean
        fuente: string
      }

      expect(resultado.ejecutado).toBe(true)
      // 0.001 < la reserva por defecto (0.01), así que reservarPresupuesto
      // falla ANTES de cualquier llamada de red y la fuente es la plantilla.
      expect(resultado.fuente).toBe('plantilla')

      const info = await db.$client.execute("PRAGMA table_info('infra_briefing')")
      expect(info.rows.map((r) => String(r.name))).toContain('auditoria_fallback')

      const filas = await db.$client.execute('SELECT corte_id FROM infra_briefing')
      expect(filas.rows.some((f) => String(f.corte_id) === 'corte-legacy-1')).toBe(true)
    } finally {
      vi.resetModules()
      if (dataDirPrevio === undefined) delete process.env.DATA_DIR
      else process.env.DATA_DIR = dataDirPrevio
      if (presupuestoPrevio === undefined) delete process.env.E8_PRESUPUESTO_USD_MES
      else process.env.E8_PRESUPUESTO_USD_MES = presupuestoPrevio
      if (jobsEnabledPrevio === undefined) delete process.env.ENOS_JOBS_ENABLED
      else process.env.ENOS_JOBS_ENABLED = jobsEnabledPrevio
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
