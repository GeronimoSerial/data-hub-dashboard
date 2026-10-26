import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { listDraftsForMap } from '@/lib/infraestructura/borradores/mapa'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/borradores/mapa', () => ({ listDraftsForMap: vi.fn() }))
vi.mock('@/lib/infraestructura/permiso-nominal', () => ({ puedeVerNominal: vi.fn() }))

const user = {
  id: 'reader-1',
  role: 'consulta' as const,
  banned: false,
  nivelIds: [],
  nivelJurIds: [],
  accesoRecursos: 'todos' as const,
  recursoIds: [],
}
const context = { params: Promise.resolve({ cueAnexo: '1801605-60' }) }

function request(query = '') {
  return new Request(`http://localhost/api/infraestructura/borradores/1801605-60${query}`)
}

describe('GET /api/infraestructura/borradores/[cueAnexo]', () => {
  beforeEach(() => {
    vi.stubEnv('REPORTES_OFFLINE_MAPA_BORRADORES', 'true')
    process.env.REPORTES_OFFLINE_MAPA_BORRADORES = 'true'
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(puedeVerNominal).mockReset()
    vi.mocked(listDraftsForMap).mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('denies users without infrastructure access before listing map drafts', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const { GET } = await import('./route')
    expect((await GET(request(), context)).status).toBe(403)
    expect(verificarAccesoLectura).toHaveBeenCalledWith()
  })

  it('validates pagination parameters', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user })
    const { GET } = await import('./route')
    const badLimit = await GET(request('?limit=51'), context)
    expect(badLimit.status).toBe(400)
    expect(listDraftsForMap).not.toHaveBeenCalled()
  })

  it('passes permission and keyset cursor to the query service', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user })
    vi.mocked(puedeVerNominal).mockResolvedValue(false)
    vi.mocked(listDraftsForMap).mockResolvedValue({ items: [], nextCursor: null })
    const cursor = Buffer.from(JSON.stringify({ actividadEn: '2026-10-15T10:00:00.000Z', draftId: 'draft-1' })).toString('base64url')
    const { GET } = await import('./route')

    const response = await GET(request(`?limit=10&cursor=${cursor}`), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(listDraftsForMap).toHaveBeenCalledWith(expect.objectContaining({
      cue: '1801605-60',
      limit: 10,
      cursor: { actividadEn: '2026-10-15T10:00:00.000Z', draftId: 'draft-1' },
      includeNominal: false,
      userId: 'reader-1',
    }))
  })
})
