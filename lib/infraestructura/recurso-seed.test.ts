import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'recurso-seed-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
  vi.resetModules()
})

// Simula un reinicio real del proceso: los singletons de conexión (getDb)
// y de seed (ensureSeeded) viven en variables de módulo, así que hay que
// limpiar el registro de módulos para forzar que se reconstruyan sobre el
// mismo archivo .sqlite en disco.
async function restart() {
  vi.resetModules()
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
}

describe('upsertRecursoInfraestructura', () => {
  it('da de alta el recurso del catálogo sobre una base ya poblada', async () => {
    await restart()
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursos } = await import('@/lib/db/schema')
    const db = getDb()
    const [row] = await db
      .select()
      .from(recursos)
      .where(eq(recursos.id, 'recurso-infraestructura'))

    expect(row).toBeDefined()
    expect(row?.ruta).toBe('/mapas/infraestructura')
    expect(row?.formato).toBe('mapa')
    expect(row?.estado).toBe('publicado')
  })

  it('reiniciar la aplicación dos veces no altera la audiencia configurada', async () => {
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursoAudienciaNiveles } = await import('@/lib/db/schema')
    await getDb()
      .insert(recursoAudienciaNiveles)
      .values({ recursoId: 'recurso-infraestructura', nivelId: 'secundario' })

    await restart()
    await restart()

    const { getDb: getDbAfter } = await import('@/lib/db')
    const { recursoAudienciaNiveles: audienciaAfter } = await import(
      '@/lib/db/schema'
    )
    const rows = await getDbAfter()
      .select()
      .from(audienciaAfter)
      .where(eq(audienciaAfter.recursoId, 'recurso-infraestructura'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.nivelId).toBe('secundario')
  })

  it('un recurso restringido no pasa a abierto en un reinicio', async () => {
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursoAudienciaUsuarios } = await import('@/lib/db/schema')
    await getDb()
      .insert(recursoAudienciaUsuarios)
      .values({ recursoId: 'recurso-infraestructura', userId: 'u-restringido' })

    await restart()

    const { getDb: getDbAfter } = await import('@/lib/db')
    const { recursoAudienciaUsuarios: audienciaAfter } = await import(
      '@/lib/db/schema'
    )
    const rows = await getDbAfter()
      .select()
      .from(audienciaAfter)
      .where(eq(audienciaAfter.recursoId, 'recurso-infraestructura'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe('u-restringido')
  })
})
