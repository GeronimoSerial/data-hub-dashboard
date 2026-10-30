import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq, ne } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string
let prevDataDir: string | undefined
let prevPgliteDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'recurso-seed-reorganizacion-'))
  prevDataDir = process.env.DATA_DIR
  prevPgliteDir = process.env.PGLITE_DATA_DIR
  process.env.DATA_DIR = dir
  // Misma PGlite persistida que el test de natalidad: un reinicio simulado
  // necesita que la base sobreviva al reset de módulos.
  process.env.PGLITE_DATA_DIR = path.join(dir, 'pg')
})

afterEach(async () => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPgliteDir === undefined) delete process.env.PGLITE_DATA_DIR
  else process.env.PGLITE_DATA_DIR = prevPgliteDir
  const { __eliminarInstanciaCacheadaParaTests } = await import('@/lib/db')
  await __eliminarInstanciaCacheadaParaTests({ directorio: path.join(dir, 'pg') })
  rmSync(dir, { recursive: true, force: true })
  vi.resetModules()
})

// Reinicio simulado: ver el comentario de restart() en
// recurso-seed-natalidad.test.ts.
async function restart() {
  vi.resetModules()
  const { __eliminarInstanciaCacheadaParaTests } = await import('@/lib/db')
  await __eliminarInstanciaCacheadaParaTests({ directorio: path.join(dir, 'pg') })
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
}

describe('upsertRecursoReorganizacion', () => {
  it('no crea el recurso en un catálogo exclusivo de infraestructura', async () => {
    await restart()
    const { getDb } = await import('@/lib/db')
    const { recursos } = await import('@/lib/db/schema')
    await getDb().delete(recursos).where(ne(recursos.id, 'recurso-infraestructura'))

    await restart()

    const { getDb: getDbAfter } = await import('@/lib/db')
    const { recursos: recursosAfter } = await import('@/lib/db/schema')
    expect(await getDbAfter().select({ id: recursosAfter.id }).from(recursosAfter))
      .toEqual([{ id: 'recurso-infraestructura' }])
  })

  it('da de alta el recurso con su ruta, formato y categoría propia', async () => {
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursos, categorias } = await import('@/lib/db/schema')
    const db = getDb()
    const [row] = await db
      .select()
      .from(recursos)
      .where(eq(recursos.id, 'recurso-reorganizacion'))
    const [categoria] = await db
      .select()
      .from(categorias)
      .where(eq(categorias.id, 'planificacion-territorial'))

    expect(row).toBeDefined()
    expect(row?.titulo).toBe('Reorganización escolar')
    expect(row?.ruta).toBe('/mapas/reorganizacion')
    expect(row?.formato).toBe('mapa')
    expect(row?.estado).toBe('publicado')
    expect(row?.categoriaId).toBe('planificacion-territorial')
    expect(categoria?.nombre).toBe('Planificación territorial')
  })

  it('reiniciar dos veces sobre una base ya poblada no duplica el recurso', async () => {
    await restart()
    await restart()
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursos, recursoTags } = await import('@/lib/db/schema')
    const db = getDb()
    const filas = await db
      .select({ id: recursos.id })
      .from(recursos)
      .where(eq(recursos.id, 'recurso-reorganizacion'))
    const tagsRecurso = await db
      .select()
      .from(recursoTags)
      .where(eq(recursoTags.recursoId, 'recurso-reorganizacion'))

    expect(filas).toHaveLength(1)
    expect(tagsRecurso.map((t) => t.tagId).sort()).toEqual([
      'planificacion',
      'territorial',
    ])
  })

  it('reiniciar la aplicación dos veces no altera la audiencia configurada', async () => {
    await restart()

    const { getDb } = await import('@/lib/db')
    const { recursoAudienciaNivelesJur } = await import('@/lib/db/schema')
    await getDb()
      .insert(recursoAudienciaNivelesJur)
      .values({ recursoId: 'recurso-reorganizacion', nivelJurisdiccionalId: 2 })

    await restart()
    await restart()

    const { getDb: getDbAfter } = await import('@/lib/db')
    const { recursoAudienciaNivelesJur: audienciaAfter } = await import(
      '@/lib/db/schema'
    )
    const rows = await getDbAfter()
      .select()
      .from(audienciaAfter)
      .where(eq(audienciaAfter.recursoId, 'recurso-reorganizacion'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.nivelJurisdiccionalId).toBe(2)
  })
})
