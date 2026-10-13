import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardObservation } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '@/lib/infraestructura/riesgo/peligro/observado'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('observado-grilla-route-', { seed: false })

const CELDA = '-27.4_-58.8'
const HASTA = '2026-10-13T12:00:00.000Z'

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  await getDb().delete(hazardObservation)
})

async function llamar(query = '') {
  const { GET } = await import('./route')
  return GET(new Request(`http://localhost/api/infraestructura/peligro/observado-grilla${query}`))
}

describe('GET /api/infraestructura/peligro/observado-grilla', () => {
  it('rechaza sin acceso con el estado de acceso denegado', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await llamar()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.geojson).toBeUndefined()
    expect(body.error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza horas distintas de 24 o 72 con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar('?horas=12')
    expect(res.status).toBe(400)
  })

  it('devuelve una FeatureCollection con una feature por celda sembrada', async () => {
    await getDb()
      .insert(hazardObservation)
      .values([
        {
          id: 'g-1',
          provider: PROVIDER_OBSERVADO,
          variable: VARIABLE_OBSERVADA,
          geometryRef: CELDA,
          valor: 2.5,
          unidad: 'mm',
          observadoEn: HASTA,
          validoDesde: HASTA,
          validoHasta: HASTA,
          calidad: null,
          rawRef: null,
          ingeridoEn: '2026-10-13T12:05:00.000Z',
        },
      ])

    mockAcceso({ ok: true, user: USER })
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body).toMatchObject({
      horas: 24,
      hasta: HASTA,
      desde: '2026-10-12T12:00:00.000Z',
      fuente: 'NASA IMERG Early',
    })
    expect(body.geojson.type).toBe('FeatureCollection')
    expect(body.geojson.features).toHaveLength(1)
    expect(body.geojson.features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Polygon' },
      properties: {
        geometryRef: CELDA,
        acumuladoMm: 2.5,
        granulos: 1,
        esperados: 48,
        parcial: true,
      },
    })
  })
})
