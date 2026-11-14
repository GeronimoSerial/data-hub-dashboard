import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-estaciones-region-', { seed: false })

const regionPrevia = process.env.REGION

// Módulos con estado a nivel de import (región, acceso): se recargan para REGION=manaos.
async function llamarEnRegion(region: string) {
  vi.resetModules()
  process.env.REGION = region
  const { __reiniciarRegionActivaParaPruebas } = await import('@/lib/infraestructura/region/activa')
  __reiniciarRegionActivaParaPruebas()
  const { migrarDb } = await import('@/lib/db')
  await migrarDb()
  const acceso = await import('@/lib/infraestructura/acceso-lectura')
  vi.mocked(acceso.verificarAccesoLectura).mockResolvedValue({ ok: true, user: USER })
  const { GET } = await import('./route')
  return GET(new Request('http://localhost/api/infraestructura/hidrometria/estaciones'))
}

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

beforeAll(() => {
  return () => {
    if (regionPrevia === undefined) delete process.env.REGION
    else process.env.REGION = regionPrevia
  }
})

describe('GET /api/infraestructura/hidrometria/estaciones en una región sin Prefectura', () => {
  it('responde 200 con estaciones vacías', async () => {
    const res = await llamarEnRegion('manaos')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ estaciones: [] })
  })
})
