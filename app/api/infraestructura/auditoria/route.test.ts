import { beforeAll, describe, expect, it, vi } from 'vitest'
import { migrarDb } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { GET } from './route'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
beforeAll(() => migrarDb())
const request = (query = '') => new Request(`http://localhost/api/infraestructura/auditoria?${query}`)

describe('consulta de auditoría', () => {
  it('exige sesión y rol admin vigente', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await GET(request())).status).toBe(401)
    for (const user of [{ role: 'editor', banned: false }, { role: 'admin', banned: true }]) {
      vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', ...user } as never)
      expect((await GET(request())).status).toBe(403)
    }
  })

  it('rechaza filtros y límites inválidos, admite fechas con zona y no cachea', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', role: 'admin', banned: false } as never)
    for (const query of ['limite=101', 'limite=0', 'cursor=invalid', 'cueAnexo=invalido', 'desde=2026-10-19', 'resultado=otro',
      'desde=2026-10-19T12:00:00Z&hasta=2026-10-19T09:00:00-03:00']) {
      expect((await GET(request(query))).status, query).toBe(400)
    }
    const response = await GET(request('limite=2'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ items: [], nextCursor: null })
  })
})
