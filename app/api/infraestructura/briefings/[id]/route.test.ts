import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { aDtoPublico } from '@/lib/infraestructura/briefing-ia/dto'
import type { BriefingPersistido } from '@/lib/infraestructura/briefing-ia/repositorio'
import { obtenerBriefingPorId } from '@/lib/infraestructura/briefing-ia/repositorio'
import { getSessionUser } from '@/lib/session'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR. Reimplementa staffGuard acá mismo
// (misma lógica que lib/session.ts) para no arrastrar esa cadena.
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

vi.mock('@/lib/infraestructura/briefing-ia/repositorio', () => ({
  obtenerBriefingPorId: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const BRIEFING: BriefingPersistido = {
  id: 'brief-1',
  corteId: 'corte-1',
  modelo: 'gpt-4o-mini',
  versionPrompt: 'briefing-v1',
  parametros: { tono: 'neutral' },
  salidaIa: { parrafos: ['Resumen generado'] },
  textoFinal: 'Texto final del briefing',
  fuente: 'ia',
  motivoFallback: null,
  tokensEntrada: 120,
  tokensSalida: 80,
  costoUsd: 0.0012,
  latenciaMs: 950,
  validacion: { ok: true },
  auditoriaFallback: null,
  creadaEn: '2026-03-10T01:00:00Z',
}

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function req(id: string) {
  return new Request(`http://localhost/api/infraestructura/briefings/${id}`)
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(obtenerBriefingPorId).mockReset()
})

describe('GET /api/infraestructura/briefings/[id]', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req(BRIEFING.id), ctx(BRIEFING.id))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No autenticado')
    expect(vi.mocked(obtenerBriefingPorId)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req(BRIEFING.id), ctx(BRIEFING.id))
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza id vacío con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(req(''), ctx(''))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('id inválido')
    expect(vi.mocked(obtenerBriefingPorId)).not.toHaveBeenCalled()
  })

  it('devuelve 404 si el briefing no existe', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(obtenerBriefingPorId).mockResolvedValue(null)
    const res = await GET(req('brief-inexistente'), ctx('brief-inexistente'))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No encontrado')
  })

  it('con staff devuelve el briefing completo', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(obtenerBriefingPorId).mockResolvedValue(BRIEFING)
    const res = await GET(req(BRIEFING.id), ctx(BRIEFING.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(vi.mocked(obtenerBriefingPorId)).toHaveBeenCalledWith(BRIEFING.id)
    expect(await res.json()).toEqual(aDtoPublico(BRIEFING))
  })

  it('con fuente plantilla no expone salidaIa ni campos internos', async () => {
    const rechazado: BriefingPersistido = {
      ...BRIEFING,
      id: 'brief-rechazado',
      salidaIa: {
        frases: [
          {
            texto: 'TEXTO_CRUDO_DEL_MODELO_RECHAZADO_NO_DEBE_APARECER',
            refs: [],
          },
        ],
      },
      textoFinal: 'Texto final desde plantilla',
      fuente: 'plantilla',
      motivoFallback: 'cifra_no_trazable',
      parametros: { secreto: 'no debe salir' },
      validacion: { valida: false, motivo: 'cifra_no_trazable' },
      auditoriaFallback: {
        motivo: 'cifra_no_trazable',
        longitudSalida: 42,
        hashSalida: 'abc123',
        tokensEntrada: 10,
        tokensSalida: 5,
        costoUsd: 0.001,
      },
    }
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(obtenerBriefingPorId).mockResolvedValue(rechazado)
    const res = await GET(req(rechazado.id), ctx(rechazado.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.salidaIa).toBeNull()
    const serializado = JSON.stringify(body)
    expect(serializado).not.toContain('TEXTO_CRUDO_DEL_MODELO_RECHAZADO_NO_DEBE_APARECER')
    expect(serializado).not.toContain('no debe salir')
  })
})
