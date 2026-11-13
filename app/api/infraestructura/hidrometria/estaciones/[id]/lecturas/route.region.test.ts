import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-lecturas-region-', { seed: false })

const regionPrevia = process.env.REGION

// Módulos con estado a nivel de import (región, acceso): se recargan para REGION=manaos.
async function llamarEnRegion(region: string, estacionId: string) {
  vi.resetModules()
  process.env.REGION = region
  const { __reiniciarRegionActivaParaPruebas } = await import('@/lib/infraestructura/region/activa')
  __reiniciarRegionActivaParaPruebas()
  const { migrarDb } = await import('@/lib/db')
  await migrarDb()
  // Base sin datasets publicados: vitest.setup.ts precarga fixtures que en producción no existen.
  const { estadoReferencias } = await import('@/lib/infraestructura/datasets/memoria')
  estadoReferencias().referencias.clear()
  const acceso = await import('@/lib/infraestructura/acceso-lectura')
  vi.mocked(acceso.verificarAccesoLectura).mockResolvedValue({ ok: true, user: USER })
  const { GET } = await import('./route')
  const url =
    `http://localhost/api/infraestructura/hidrometria/estaciones/${estacionId}/lecturas` +
    '?desde=2026-01-01T00:00:00Z&hasta=2026-01-02T00:00:00Z'
  return GET(new Request(url), { params: Promise.resolve({ id: estacionId }) })
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

describe('GET /api/infraestructura/hidrometria/estaciones/[id]/lecturas en una región sin Prefectura', () => {
  it('responde 404 estacion_no_encontrada para una estación de Corrientes en Manaos, sin lanzar', async () => {
    const res = await llamarEnRegion('manaos', 'pna-ituzaingo')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: 'Estación no encontrada en el catálogo hidrométrico',
      codigo: 'estacion_no_encontrada',
    })
  }, 30_000)
})
