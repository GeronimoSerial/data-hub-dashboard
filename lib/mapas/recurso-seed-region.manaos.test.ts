import { inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'
import { RECURSO_NATALIDAD_ID } from '@/lib/mapas/recurso-seed-natalidad'
import { RECURSO_REORGANIZACION_ID } from '@/lib/mapas/recurso-seed-reorganizacion'

usarDbTemporal('recurso-modulos-m-', { seed: false })

const IDS = [RECURSO_NATALIDAD_ID, RECURSO_REORGANIZACION_ID]

async function sembrar(region: string) {
  vi.stubEnv('REGION', region)
  __reiniciarRegionActivaParaPruebas()
  await ensureSeeded()
  const filas = await getDb().select({ id: recursos.id, titulo: recursos.titulo }).from(recursos).where(inArray(recursos.id, IDS))
  return filas.map((f) => f.id).sort()
}

afterAll(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('cards de módulos exclusivos de Corrientes',()=>{
  it('Manaos no siembra natalidad ni reorganización', async () => {
    expect(await sembrar('manaos')).toEqual([])
  })
})
