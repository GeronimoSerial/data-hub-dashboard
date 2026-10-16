import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { getDraftCounts } from '@/lib/infraestructura/borradores/mapa'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/borradores/mapa', () => ({ getDraftCounts: vi.fn() }))

const user = {
  id: 'reader-1',
  role: 'consulta' as const,
  banned: false,
  nivelIds: [],
  nivelJurIds: [],
  accesoRecursos: 'todos' as const,
  recursoIds: [],
}

function request(query = '') {
  return new Request(`http://localhost/api/infraestructura/borradores/conteos${query}`)
}

describe('GET /api/infraestructura/borradores/conteos', () => {
  beforeEach(() => {
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(getDraftCounts).mockReset()
  })

  it('requires map read access', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(getDraftCounts).not.toHaveBeenCalled()
  })

  it('validates viewport CUEs and performs one grouped query', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user })
    vi.mocked(getDraftCounts).mockResolvedValue([{ cue: '1801605-60', count: 2 }])
    const { GET } = await import('./route')

    const invalid = await GET(request('?cues=bad'))
    expect(invalid.status).toBe(400)
    expect(getDraftCounts).not.toHaveBeenCalled()

    const response = await GET(request('?cues=1801605-60,1801605-60'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [{ cue: '1801605-60', count: 2 }] })
    expect(getDraftCounts).toHaveBeenCalledTimes(1)
    expect(getDraftCounts).toHaveBeenCalledWith(['1801605-60'])
  })
})
