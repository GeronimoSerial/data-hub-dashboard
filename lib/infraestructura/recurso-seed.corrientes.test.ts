import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

usarDbTemporal('recurso-corrientes-', { seed: false })

const ID = 'recurso-infraestructura'

async function fila() {
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, ID))
  return row
}

beforeAll(async () => {
  vi.stubEnv('REGION', '')
  __reiniciarRegionActivaParaPruebas()
  await ensureSeeded()
})

afterAll(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('recurso de infraestructura en Corrientes', () => {
  it('se siembra exactamente como siempre', async () => {
    expect(await fila()).toMatchObject({
      id: ID,
      titulo: 'ENOS Corrientes',
      descripcion:
        'Alertas activas de infraestructura escolar georreferenciadas, con indicadores consolidados por territorio, nivel y establecimiento.',
      formato: 'mapa',
      nivelId: 'transversal',
      tipoId: 'georref',
      categoriaId: 'infraestructura',
      area: 'Dirección de Gestión Escolar',
      actualizado: '2026-09-16',
      estado: 'publicado',
      ruta: '/mapas/infraestructura',
    })
  })
})
