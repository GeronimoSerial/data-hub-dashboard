import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { FilaVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'
import { generarPdfVeredictos } from '@/lib/infraestructura/veredicto/pdf'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { getSessionUser } from '@/lib/session'

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

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ fake: true })),
}))

vi.mock('@/lib/infraestructura/veredicto/repositorio', () => ({
  listarVigentes: vi.fn(),
}))

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({
  cargarEventosTerreno: vi.fn(),
}))
vi.mock('@/lib/infraestructura/veredicto/pdf', () => ({
  generarPdfVeredictos: vi.fn(),
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
  motivoFallback: null,
  modelo: null,
  versionPrompt: null,
  tokensEntrada: null,
  tokensSalida: null,
  costoUsd: null,
  latenciaMs: null,
  enCalibracion: false,
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
  return new Request(`http://localhost/api/infraestructura/veredictos/pdf${query}`)
}

const BYTES = new Uint8Array([37, 80, 68, 70]) // "%PDF"

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(listarVigentes).mockReset()
  vi.mocked(listarVigentes).mockResolvedValue([FILA])
  vi.mocked(generarPdfVeredictos).mockReset()
  vi.mocked(generarPdfVeredictos).mockResolvedValue(BYTES)
  vi.mocked(cargarEventosTerreno).mockReset()
  vi.mocked(cargarEventosTerreno).mockResolvedValue([])
})

describe('GET /api/infraestructura/veredictos/pdf', () => {
  it('rechaza sin sesión con 401 y no genera PDF', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(generarPdfVeredictos)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(403)
  })

  it('responde 400 con formato de fecha inválido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=01-10-2026&hasta=2026-10-05'))
    expect(res.status).toBe(400)
    expect(vi.mocked(generarPdfVeredictos)).not.toHaveBeenCalled()
  })

  it('responde 400 si el rango supera 31 días', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-01-01&hasta=2026-03-01'))
    expect(res.status).toBe(400)
  })

  it('devuelve el PDF como adjunto con nombre por rango y sin caché', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="veredicto-2026-10-01-a-2026-10-05.pdf"',
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES)
  })

  it('consulta vigentes del rango y genera el PDF con los DTO', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    await GET(req('?desde=2026-10-01&hasta=2026-10-05'))
    expect(vi.mocked(listarVigentes)).toHaveBeenCalledWith({ fake: true }, { desde: '2026-10-01', hasta: '2026-10-05' })
    const entrada = vi.mocked(generarPdfVeredictos).mock.calls[0]![0]
    expect(entrada.veredictos).toHaveLength(1)
    expect(entrada.veredictos[0]!.id).toBe('ver-1')
    expect(entrada.generadoEn).toBeInstanceOf(Date)
  })
})
