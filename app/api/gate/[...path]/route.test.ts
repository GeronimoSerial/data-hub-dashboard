import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, getDb, loadRecursoAccessByRuta } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getDb: vi.fn(),
  loadRecursoAccessByRuta: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb }))
vi.mock('@/lib/db/recurso-access', () => ({ loadRecursoAccessByRuta }))

import { GET } from './route'

describe('GET /api/gate/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionUser.mockResolvedValue({
      id: 'reader', role: 'consulta', banned: false, nivelJurIds: [],
      accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false },
    })
    loadRecursoAccessByRuta.mockResolvedValue({
      id: 'restricted-report',
      access: { id: 'restricted-report', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] },
    })
    getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ formato: 'reporte', ruta: '/recursos/private.pdf' }] }) }) }),
    })
  })

  it('denies direct static delivery for a disabled infrastructure section', async () => {
    const response = await GET(new Request('http://localhost/api/gate/recursos/private.pdf'), {
      params: Promise.resolve({ path: ['recursos', 'private.pdf'] }),
    })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/forbidden')
  })
})
