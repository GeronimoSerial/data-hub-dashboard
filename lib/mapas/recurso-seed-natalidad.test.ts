import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string
let prevDataDir: string | undefined
let prevPgliteDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'recurso-seed-natalidad-'))
  prevDataDir = process.env.DATA_DIR
  prevPgliteDir = process.env.PGLITE_DATA_DIR
  process.env.DATA_DIR = dir
  // Simular un reinicio de la app (`vi.resetModules()`) solo tiene sentido si
  // la MISMA base sobrevive al reset. Bajo Vitest getDb() usa una PGlite en
  // memoria (aislada por archivo de test, pero perdida al resetear módulos),
  // así que este test opta por una PGlite persistida en DATA_DIR/pg. Ver el
  // comentario de PGLITE_DATA_DIR en lib/db/index.ts.
  process.env.PGLITE_DATA_DIR = path.join(dir, 'pg')
})

afterEach(async () => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPgliteDir === undefined) delete process.env.PGLITE_DATA_DIR
  else process.env.PGLITE_DATA_DIR = prevPgliteDir
  // Cierra la PGlite persistida antes de borrar el directorio para no dejar
  // handles abiertos (PGlite emite un unhandled rejection al desaparecer).
  const { __eliminarInstanciaCacheadaParaTests } = await import('@/lib/db')
  await __eliminarInstanciaCacheadaParaTests({ directorio: path.join(dir, 'pg') })
  rmSync(dir, { recursive: true, force: true })
  vi.resetModules()
})

// Simula un reinicio real del proceso: los singletons de conexión (getDb) y
// de seed (ensureSeeded) viven en variables de módulo, así que hay que
// limpiar el registro de módulos para forzar que se reconstruyan sobre la
// misma base PGlite persistida en DATA_DIR/pg. Como el cache de conexión vive
// además en globalThis (para no duplicar PGlite entre los bundles de next dev,
// ver lib/db/index.ts) y `vi.resetModules()` NO vacía globalThis, hay que
// borrar explícitamente la entrada de ese directorio: un reinicio real de
// proceso también vacía globalThis.
async function restart() {
  vi.resetModules()
  const { __eliminarInstanciaCacheadaParaTests } = await import('@/lib/db')
  await __eliminarInstanciaCacheadaParaTests({ directorio: path.join(dir, 'pg') })
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
