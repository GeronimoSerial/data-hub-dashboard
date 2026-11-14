import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoSeccion: vi.fn() }))

usarDbTemporal('situacion-escuelas-')

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const admin = { id: 'a', role: 'admin' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
const url = (qs = '') => new Request(`http://localhost/api/infraestructura/situacion/escuelas${qs}`)

beforeEach(() => { vi.mocked(verificarAccesoSeccion).mockReset() })

describe('GET /api/infraestructura/situacion/escuelas', () => {
  it('rechaza a quien no es staff con 403', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: { ...admin, role: 'consulta' as never } })
    expect((await GET(url('?cues=1800001-00'))).status).toBe(403)
  })

  it('sin cues o con CUEs desconocidos responde 200 con un mapa vacío', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: admin })
    expect(await (await GET(url())).json()).toEqual({ nombres: {} })
    const res = await GET(url('?cues=0000000-00'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).nombres).toEqual({})
  })
})
