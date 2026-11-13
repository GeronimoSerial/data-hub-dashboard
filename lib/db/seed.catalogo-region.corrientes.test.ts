import { createHash } from 'node:crypto'
import { asc } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursoTags, recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

usarDbTemporal('catalogo-corrientes-', { seed: false })

afterAll(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('catálogo inicial de Corrientes', () => {
  it('se siembra igual que siempre', async () => {
    vi.stubEnv('REGION', '')
    __reiniciarRegionActivaParaPruebas()
    await ensureSeeded()
    const filas = await getDb().select().from(recursos).orderBy(asc(recursos.id))
    const tags = await getDb().select().from(recursoTags).orderBy(asc(recursoTags.recursoId), asc(recursoTags.tagId))
    const huella = createHash('sha1').update(JSON.stringify(filas.map(({ id, titulo, descripcion, area, ruta, formato }) => ({ id, titulo, descripcion, area, ruta, formato })))).update(JSON.stringify(tags)).digest('hex')
    expect(huella).toBe('bbf8d2ff74a827e24433ac7ec563024734b05032')
  })
})
