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
    nivelJurIds: [],
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

  it.each([
    ['sin sesión responde 401 y no toca la carga de datos', 401, 'No autenticado'],
    ['sin audiencia permitida responde 403 y no toca la carga de datos', 403, 'No tiene acceso a este recurso'],
  ] as const)('%s', async (_titulo, status, error) => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
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
