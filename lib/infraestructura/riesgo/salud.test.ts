import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import type { EstadoJobRun, obtenerEstadoOperativo as ObtenerEstadoOperativoFn } from './salud'

let dir: string
let prevDataDir: string | undefined
let obtenerEstadoOperativo: typeof ObtenerEstadoOperativoFn

// getDb() memoiza la conexión a nivel de módulo, así que DATA_DIR debe
// setearse ANTES del primer getDb(); mismo patrón que job-run.test.ts.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'salud-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ obtenerEstadoOperativo } = await import('./salud'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

type FilaJobRun = typeof infraJobRun.$inferInsert

function fila(over: Partial<FilaJobRun> & Pick<FilaJobRun, 'id' | 'tipo' | 'estado' | 'actualizadaEn'>): FilaJobRun {
  return {
    claveIdempotente: over.id,
    iniciadoEn: over.actualizadaEn,
    version: 'v1',
    creadaEn: over.actualizadaEn,
    ...over,
  }
}

async function buscarJob(tipo: string): Promise<EstadoJobRun | undefined> {
  const estado = await obtenerEstadoOperativo()
  return estado.jobs.find((job) => job.tipo === tipo)
}

describe('obtenerEstadoOperativo — flags.enosJobsEnabled', () => {
  const previo = process.env.ENOS_JOBS_ENABLED

  afterAll(() => {
    if (previo === undefined) delete process.env.ENOS_JOBS_ENABLED
    else process.env.ENOS_JOBS_ENABLED = previo
  })

  it('expone el flag maestro de jobs (default true) junto a los flags de UI', async () => {
    delete process.env.ENOS_JOBS_ENABLED
    const estado = await obtenerEstadoOperativo()
    expect(estado.flags.enosJobsEnabled).toBe(true)
  })

  it('refleja ENOS_JOBS_ENABLED=false', async () => {
    process.env.ENOS_JOBS_ENABLED = 'false'
    const estado = await obtenerEstadoOperativo()
    expect(estado.flags.enosJobsEnabled).toBe(false)
  })
})

describe('obtenerEstadoOperativo — ultimaCompletadaEn', () => {
  it('apunta a la última fila completada aunque la más reciente haya fallado', async () => {
    const db = getDb()
    const completadoViejo = '2026-01-01T00:00:00.000Z'
    const fallidoReciente = '2026-01-02T00:00:00.000Z'
    await db.insert(infraJobRun).values([
      fila({ id: 'geo-completado', tipo: 'geo-perfiles', estado: 'completado', actualizadaEn: completadoViejo }),
      fila({ id: 'geo-fallido', tipo: 'geo-perfiles', estado: 'fallido', actualizadaEn: fallidoReciente }),
    ])

    const job = await buscarJob('geo-perfiles')
    expect(job).toBeDefined()
    expect(job?.estado).toBe('fallido')
    expect(job?.actualizadaEn).toBe(fallidoReciente)
    expect(job?.ultimaCompletadaEn).toBe(completadoViejo)
  })

  it('es null cuando el tipo nunca completó ninguna fila', async () => {
    const db = getDb()
    await db.insert(infraJobRun).values([
      fila({ id: 'clima-fallido', tipo: 'climatologia-caudal', estado: 'fallido', actualizadaEn: '2026-01-01T00:00:00.000Z' }),
      fila({ id: 'clima-en-progreso', tipo: 'climatologia-caudal', estado: 'en_progreso', actualizadaEn: '2026-01-02T00:00:00.000Z' }),
    ])

    const job = await buscarJob('climatologia-caudal')
    expect(job).toBeDefined()
    expect(job?.ultimaCompletadaEn).toBeNull()
  })
})
