import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { FilaVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'
import { getSessionUser } from '@/lib/session'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro para no arrastrar @/lib/session -> @/lib/db antes de fijar DATA_DIR.
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
  verificarAccesoLectura: vi.fn(async () => ({ ok: true, user: {
    id: 'staff', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  } })),
}))

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ fake: true })),
}))

vi.mock('@/lib/infraestructura/veredicto/repositorio', () => ({
  listarVigentes: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const FILA = {
  id: 'ver-1',
  fecha: '2026-10-12',
  ambito: 'provincia',
  tipoDia: 'observado',
  nivel: 'sin_senal',
  trazaReglas: { reglas: [] },
  metricas: { metricas: [] },
  cobertura: { fuentesAusentes: [] },
  textoFinal: 'Texto',
  salidaIa: null,
  fuente: 'plantilla',
  motivoFallback: 'sin credenciales',
  modelo: null,
  versionPrompt: null,
  tokensEntrada: null,
  tokensSalida: null,
  costoUsd: null,
  latenciaMs: null,
  enCalibracion: true,
  generadoEn: '2026-10-13T09:00:00.000Z',
  cerrado: false,
  inputsHash: 'h',
  jobRunId: null,
  reemplazadoPor: null,
} as unknown as FilaVeredicto

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function req(query = '') {
  return new Request(`http://localhost/api/infraestructura/veredictos${query}`)
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: {
    id: 'staff', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  } })
  vi.mocked(listarVigentes).mockReset()
  vi.mocked(listarVigentes).mockResolvedValue([])
})

describe('GET /api/infraestructura/veredictos', () => {
  it('rechaza una sección de infraestructura deshabilitada con 403', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(403)
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
  })

  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No autenticado')
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('responde 400 con formato de fecha inválido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=01-10-2026&hasta=2026-10-05'))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
  })

  it('responde 400 con una fecha inexistente', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-02-30&hasta=2026-03-01'))
    expect(res.status).toBe(400)
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
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
  })

  it('acepta exactamente 31 días', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-01-01&hasta=2026-01-31'))
    expect(res.status).toBe(200)
  })

  it('con staff devuelve los veredictos vigentes del rango', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(listarVigentes).mockResolvedValue([FILA])
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(listarVigentes)).toHaveBeenCalledWith(
      { fake: true },
      { desde: '2026-10-01', hasta: '2026-10-05' },
    )
    const body = await res.json()
    expect(body).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-05',
      veredictos: [
        expect.objectContaining({ id: 'ver-1', fecha: '2026-10-12', version: null, texto: 'Texto' }),
      ],
    })
    expect(JSON.stringify(body)).not.toContain('sin credenciales')
  })

  it('sin parámetros usa la ventana de fechasVentana para hoy', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.hasta >= body.desde).toBe(true)
    expect(vi.mocked(listarVigentes)).toHaveBeenCalledWith(
      { fake: true },
      { desde: body.desde, hasta: body.hasta },
    )
  })
})
