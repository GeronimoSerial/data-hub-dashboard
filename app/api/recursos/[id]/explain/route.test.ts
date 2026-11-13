import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, getDb, loadRecursoAccess } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getDb: vi.fn(),
  loadRecursoAccess: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb }))
vi.mock('@/lib/db/recurso-access', () => ({ loadRecursoAccess }))
vi.mock('@/lib/db/hub', () => ({ loadHubCatalog: vi.fn(async () => ({
  recursos: [{ id: 'recurso-infraestructura', formato: 'mapa', titulo: 'Infra', descripcion: 'Desc', categoriaId: null, nivelId: null, tipoId: null, tagIds: [] }],
  categorias: [], niveles: [], tipos: [], tags: [],
})) }))

import { POST } from './route'

describe('POST /api/recursos/[id]/explain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDb.mockReturnValue({ select: () => ({ from: () => ({ where: async () => [{
      id: 'recurso-infraestructura', estado: 'publicado', formato: 'mapa', ruta: '/mapas/infraestructura',
    }] }) }), insert: () => ({ values: async () => undefined }) })
    loadRecursoAccess.mockResolvedValue({
      id: 'recurso-infraestructura', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [],
    })
    getSessionUser.mockResolvedValue({
      id: 'reader', role: 'consulta', banned: false, nivelJurIds: [],
      accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false },
    })
  })

  it('denies explanation requests for a section-restricted resource', async () => {
    const response = await POST(new Request('http://localhost/api/recursos/recurso-infraestructura/explain', { method: 'POST' }), {
      params: Promise.resolve({ id: 'recurso-infraestructura' }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not return metadata for a directly requested resource in a disabled section', async () => {
    getSessionUser.mockResolvedValue({
      id: 'staff', role: 'editor', banned: false, nivelJurIds: [],
      accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['reports'], landing: false },
    })
    const response = await POST(new Request('http://localhost/api/recursos/recurso-infraestructura/explain', { method: 'POST' }), {
      params: Promise.resolve({ id: 'recurso-infraestructura' }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).not.toHaveProperty('explanation')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
