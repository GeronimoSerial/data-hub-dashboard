import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { FilaVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { historialVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { getSessionUser } from '@/lib/session'

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

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ fake: true })),
}))

vi.mock('@/lib/infraestructura/veredicto/repositorio', () => ({
  historialVeredicto: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

function fila(id: string, generadoEn: string, reemplazadoPor: string | null): FilaVeredicto {
  return {
    id,
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'sin_senal',
    trazaReglas: { reglas: [] },
    metricas: { metricas: [] },
    cobertura: { fuentesAusentes: [] },
    textoFinal: `Texto ${id}`,
    salidaIa: null,
    fuente: 'plantilla',
    motivoFallback: 'sin credenciales',
    modelo: null,
    tokensEntrada: 10,
    costoUsd: 0.01,
    enCalibracion: true,
    generadoEn,
    cerrado: false,
    inputsHash: `h-${id}`,
    jobRunId: 'job-x',
    reemplazadoPor,
  } as unknown as FilaVeredicto
}

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function req(query: string) {
  return new Request(`http://localhost/api/infraestructura/veredictos/historial${query}`)
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(historialVeredicto).mockReset()
  vi.mocked(historialVeredicto).mockResolvedValue([])
})

describe('GET /api/infraestructura/veredictos/historial', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req('?fecha=2026-10-12&ambito=provincia'))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(historialVeredicto)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req('?fecha=2026-10-12&ambito=provincia'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('responde 400 si falta fecha', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?ambito=provincia'))
    expect(res.status).toBe(400)
    expect(vi.mocked(historialVeredicto)).not.toHaveBeenCalled()
  })

  it('responde 400 si falta ambito', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?fecha=2026-10-12'))
    expect(res.status).toBe(400)
    expect(vi.mocked(historialVeredicto)).not.toHaveBeenCalled()
  })

  it('responde 400 si la fecha tiene formato inválido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?fecha=12-10-2026&ambito=provincia'))
    expect(res.status).toBe(400)
  })

  it('numera las versiones: la más reciente tiene el número más alto', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    // historialVeredicto devuelve la más reciente primero.
    vi.mocked(historialVeredicto).mockResolvedValue([
      fila('v3', '2026-10-13T12:00:00.000Z', null),
      fila('v2', '2026-10-13T10:00:00.000Z', 'v3'),
      fila('v1', '2026-10-13T08:00:00.000Z', 'v2'),
    ])
    const res = await GET(req('?fecha=2026-10-12&ambito=provincia'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(historialVeredicto)).toHaveBeenCalledWith(
      { fake: true },
      { fecha: '2026-10-12', ambito: 'provincia' },
    )
    const body = await res.json()
    expect(body.versiones.map((v: { id: string }) => v.id)).toEqual(['v3', 'v2', 'v1'])
    expect(body.versiones.map((v: { version: number }) => v.version)).toEqual([3, 2, 1])
    expect(JSON.stringify(body)).not.toContain('sin credenciales')
    expect(JSON.stringify(body)).not.toContain('job-x')
  })

  it('devuelve lista vacía si no hay versiones', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?fecha=2026-10-12&ambito=provincia'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ versiones: [] })
  })
})
