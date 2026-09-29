import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { infraGeoProfile, infraGeoRio } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

const CUE = '1801605-04'

usarDbTemporal('geo-perfiles-route-')

let GET: typeof Ruta.GET

beforeAll(async () => {
  await getDb().insert(infraGeoProfile).values([
    {
      cueAnexo: CUE,
      lat: -31.7,
      lon: -60.5,
      geoCalidad: 'alta',
      departamento: 'Parana',
      geometryRef: '-31.7_-60.5',
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    },
    {
      cueAnexo: '1801605-05',
      lat: null,
      lon: null,
      geoCalidad: null,
      departamento: 'Parana',
      geometryRef: null,
      motivoExclusion: 'sin_coordenadas',
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    },
  ])

  await getDb().insert(infraGeoRio).values({
    cueAnexo: CUE,
    puntoRioId: 'rio-1801605',
    distanciaKm: 4.2,
    radioMaximoKm: 10,
    version: 'v1',
    calculadoEn: '2026-01-01T00:00:00Z',
  })
  GET = (await import('./route')).GET
})

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
})

function ctx(cueAnexo: string) {
  return { params: Promise.resolve({ cueAnexo }) }
}

function req() {
  return new Request(`http://localhost/api/infraestructura/geo-perfiles/${CUE}`)
}

describe('GET /api/infraestructura/geo-perfiles/[cueAnexo]', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('No tiene acceso a este recurso')
  })

  it('con acceso devuelve el perfil completo, incluyendo motivoExclusion null', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.cueAnexo).toBe(CUE)
    expect(body.geometryRef).toBe('-31.7_-60.5')
    expect(body.motivoExclusion).toBeNull()
    expect(body.perfilVersion).toBe('v1')
  })

  it('devuelve el perfil de exclusión tal cual (motivoExclusion no null)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('1801605-05'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.motivoExclusion).toBe('sin_coordenadas')
  })

  it('incluye rioAsociacion cuando el CUE tiene fila en infraGeoRio', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rioAsociacion).toEqual({
      puntoRioId: 'rio-1801605',
      distanciaKm: 4.2,
    })
  })

  it('devuelve rioAsociacion null (200, no 404) si la asociación de río todavía no corrió', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('1801605-05'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cueAnexo).toBe('1801605-05')
    expect(body.rioAsociacion).toBeNull()
  })

  it('devuelve 404 si no hay fila para el CUE-anexo', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('9999999-99'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Sin perfil geográfico para ese CUE-anexo')
  })

  it('rechaza cueAnexo inválido (vacío) con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('cueAnexo inválido')
  })

  it('rechaza cueAnexo demasiado largo con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('x'.repeat(51)))
    expect(res.status).toBe(400)
  })
})
