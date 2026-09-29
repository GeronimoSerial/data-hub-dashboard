import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { cargarTerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

// ACL y carga de datos se mockean: estos tests verifican el contrato del route
// (orden ACL -> ensureSeeded -> carga, códigos y passthrough), no la DB.
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))
vi.mock('@/lib/infraestructura/territorio-mapa', () => ({
  cargarTerritorioMapa: vi.fn(),
}))

function usuario(): SessionUser {
  return {
    id: 'u-1',
    role: 'consulta',
    banned: false,
    nivelIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}

function req() {
  return new Request('http://localhost/api/mapas/infraestructura/territorio')
}

describe('GET /api/mapas/infraestructura/territorio', () => {
  beforeEach(() => {
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(cargarTerritorioMapa).mockReset()
  })

  it('sin sesión responde 401 y no toca la carga de datos', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
    expect(cargarTerritorioMapa).not.toHaveBeenCalled()
  })

  it('sin audiencia permitida responde 403 y no toca la carga de datos', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
    expect(cargarTerritorioMapa).not.toHaveBeenCalled()
  })

  it('con acceso responde 200 y hace passthrough del territorio', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    const territorio: TerritorioMapa = {
      aislamiento: {
        fuente: 'OpenStreetMap',
        atribucion: '© OpenStreetMap contributors',
        licencia: 'ODbL-1.0',
        fechaExtractoOsm: '2026-01-01',
        versionJob: '1',
        escuelas: {
          'CUE-1': {
            nivel: 2,
            cruces: 5,
            conPuente: 1,
            sinPuente: 0,
            alternativaSinCruce: null,
          },
        },
      },
      susceptibilidad: null,
    }
    vi.mocked(cargarTerritorioMapa).mockResolvedValue(territorio)

    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(await res.json()).toEqual(territorio)
    expect(cargarTerritorioMapa).toHaveBeenCalledTimes(1)
  })
})
