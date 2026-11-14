import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursoTags, recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { upsertRecursoInfraestructura } from '@/lib/infraestructura/recurso-seed'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

usarDbTemporal('recurso-manaos-', { seed: false })

const ID = 'recurso-infraestructura'

async function fila() {
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, ID))
  return row
}

beforeAll(async () => {
  vi.stubEnv('REGION', 'manaos')
  __reiniciarRegionActivaParaPruebas()
  await ensureSeeded()
})

afterAll(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('recurso de infraestructura en Manaos', () => {
  it('la card del mapa lleva el nombre de la región y ningún texto de Corrientes', async () => {
    const row = await fila()
    expect(row).toMatchObject({
      id: ID,
      titulo: 'ENOS Manaos',
      formato: 'mapa',
      nivelId: 'transversal',
      tipoId: 'georref',
      categoriaId: 'infraestructura',
      estado: 'publicado',
      ruta: '/mapas/infraestructura',
    })
    expect(JSON.stringify(row)).not.toMatch(/Corrientes|Gestión Escolar/)
    const todos = await getDb().select({ titulo: recursos.titulo }).from(recursos)
    expect(todos.map((r) => r.titulo)).not.toContain('ENOS Corrientes')
  })

  it('conserva las etiquetas del recurso y es idempotente', async () => {
    await upsertRecursoInfraestructura()
    await upsertRecursoInfraestructura()
    const etiquetas = await getDb().select().from(recursoTags).where(eq(recursoTags.recursoId, ID))
    expect(etiquetas.map((e) => e.tagId).sort()).toEqual(['alertas', 'territorial'])
  })

  it('renombra la card que una versión anterior sembró con el nombre de Corrientes', async () => {
    await getDb().update(recursos).set({ titulo: 'ENOS Corrientes', area: 'Dirección de Gestión Escolar' }).where(eq(recursos.id, ID))
    await upsertRecursoInfraestructura()
    expect(await fila()).toMatchObject({ titulo: 'ENOS Manaos', area: 'ENOS' })
  })
})
