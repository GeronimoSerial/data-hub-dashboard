import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, getDb } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser, staffGuard: vi.fn() }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb }))
vi.mock('@/lib/archivo', () => ({ archivoGate: vi.fn(() => 200) }))

import { GET } from './route'

describe('GET /api/recursos/[id]/archivo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: async () => [{
            id: 'recurso-infraestructura',
            formato: 'mapa',
            ruta: '/mapas/infraestructura',
            estado: 'publicado',
            storageKey: 'unused',
          }],
        }),
      }),
    })
    getSessionUser.mockResolvedValue({
      id: 'reader', role: 'consulta', banned: false, nivelJurIds: [],
      accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false },
    })
  })

  it('denies an infrastructure resource file when its section is disabled', async () => {
    const response = await GET(new Request('http://localhost/api/recursos/recurso-infraestructura/archivo'), {
      params: Promise.resolve({ id: 'recurso-infraestructura' }),
    })
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
