import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'recurso-seed-natalidad-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
  vi.resetModules()
})

// Mismo patrón que lib/infraestructura/recurso-seed.test.ts: simula un
// reinicio real del proceso limpiando el registro de módulos, para forzar
// que los singletons (getDb, ensureSeeded) se reconstruyan sobre el mismo
// .sqlite en disco.
async function restart() {
  vi.resetModules()
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
}

describe('upsertRecursoNatalidad', () => {
  it('da de alta el recurso del catálogo sobre una base ya poblada', async () => {
    await restart()
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursos } = await import('@/lib/db/schema')
    const db = getDb()
    const [row] = await db
      .select()
      .from(recursos)
      .where(eq(recursos.id, 'recurso-natalidad'))

    expect(row).toBeDefined()
    expect(row?.ruta).toBe('/mapas/natalidad')
    expect(row?.formato).toBe('mapa')
    expect(row?.estado).toBe('publicado')
  })

  it('reiniciar la aplicación dos veces no altera la audiencia configurada', async () => {
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursoAudienciaNiveles } = await import('@/lib/db/schema')
    await getDb()
      .insert(recursoAudienciaNiveles)
      .values({ recursoId: 'recurso-natalidad', nivelId: 'secundario' })

    await restart()
    await restart()

    const { getDb: getDbAfter } = await import('@/lib/db')
    const { recursoAudienciaNiveles: audienciaAfter } = await import(
      '@/lib/db/schema'
    )
    const rows = await getDbAfter()
      .select()
      .from(audienciaAfter)
      .where(eq(audienciaAfter.recursoId, 'recurso-natalidad'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.nivelId).toBe('secundario')
  })
})
