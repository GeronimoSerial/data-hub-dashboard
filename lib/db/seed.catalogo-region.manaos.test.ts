import { afterAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

usarDbTemporal('catalogo-manaos-', { seed: false })

afterAll(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('catálogo inicial de Manaos', () => {
  it('siembra solo el recurso ENOS, ninguno del catálogo de Corrientes', async () => {
    vi.stubEnv('REGION', 'manaos')
    __reiniciarRegionActivaParaPruebas()
    await ensureSeeded()
    const ids = (await getDb().select({ id: recursos.id }).from(recursos)).map((r) => r.id)
    expect(ids).toEqual(['recurso-infraestructura'])
  })
})
