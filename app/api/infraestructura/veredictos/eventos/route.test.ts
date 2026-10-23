import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { getSessionUser } from '@/lib/session'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro para no arrastrar @/lib/session antes de fijar DATA_DIR.
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
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(async () => ({ ok: true, user: { id: 'staff', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } })),
}))

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({
  cargarEventosTerreno: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function req(query = '') {
  return new Request(`http://localhost/api/infraestructura/veredictos/eventos${query}`)
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: { id: 'staff', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } })
  vi.mocked(cargarEventosTerreno).mockReset()
  vi.mocked(cargarEventosTerreno).mockResolvedValue([])
})

describe('GET /api/infraestructura/veredictos/eventos', () => {
  it('rechaza una sección de infraestructura deshabilitada con 403', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(403)
    expect(vi.mocked(cargarEventosTerreno)).not.toHaveBeenCalled()
  })
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(401)
    expect(vi.mocked(cargarEventosTerreno)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(403)
  })

  it('exige desde y hasta con formato YYYY-MM-DD válido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    expect((await GET(req('?hasta=2026-10-05'))).status).toBe(400)
    expect((await GET(req('?desde=01-10-2026&hasta=2026-10-05'))).status).toBe(400)
    expect((await GET(req('?desde=2026-02-30&hasta=2026-03-01'))).status).toBe(400)
    expect(vi.mocked(cargarEventosTerreno)).not.toHaveBeenCalled()
  })

  it('responde 400 si desde es posterior a hasta', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-10-05&hasta=2026-10-01'))
    expect(res.status).toBe(400)
  })

  it('responde 400 si el rango supera 31 días', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-01-01&hasta=2026-02-01'))
    expect(res.status).toBe(400)
    expect(vi.mocked(cargarEventosTerreno)).not.toHaveBeenCalled()
  })

  it('devuelve { eventos } sin caché para staff', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(cargarEventosTerreno).mockResolvedValue([
      {
        id: 'EVT-1',
        fecha: '2026-10-12',
        fechaTexto: '12/10',
        departamento: 'CAPITAL',
        lugar: 'Ciudad',
        titulo: 'Crecida',
        tipo: 'Evento reportado',
        confianza: 'alta',
        confianzaTexto: 'Confianza alta',
        fuente: { medio: 'Diario X', fecha: '12/10/2026', url: 'https://ex.com/a' },
      },
    ])
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-31'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(cargarEventosTerreno)).toHaveBeenCalledWith({ desde: '2026-10-01', hasta: '2026-10-31' })
    const cuerpo = await res.json()
    expect(cuerpo.eventos).toHaveLength(1)
    expect(cuerpo.eventos[0].id).toBe('EVT-1')
  })
})
