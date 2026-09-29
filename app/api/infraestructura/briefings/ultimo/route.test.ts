import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { aDtoPublico } from '@/lib/infraestructura/briefing-ia/dto'
import type { BriefingPersistido } from '@/lib/infraestructura/briefing-ia/repositorio'
import { obtenerUltimoBriefing } from '@/lib/infraestructura/briefing-ia/repositorio'
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
  obtenerUltimoBriefing: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const BRIEFING: BriefingPersistido = {
  id: 'brief-2',
  corteId: 'corte-2',
  modelo: 'gpt-4o-mini',
  versionPrompt: 'briefing-v1',
  parametros: { tono: 'neutral' },
  salidaIa: null,
  textoFinal: 'Texto final desde plantilla',
  fuente: 'plantilla',
  motivoFallback: 'sin credenciales',
  tokensEntrada: null,
  tokensSalida: null,
  costoUsd: null,
  latenciaMs: null,
  validacion: { ok: true },
  auditoriaFallback: null,
  creadaEn: '2026-03-11T01:00:00Z',
}

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function req() {
  return new Request('http://localhost/api/infraestructura/briefings/ultimo')
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(obtenerUltimoBriefing).mockReset()
})

describe('GET /api/infraestructura/briefings/ultimo', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No autenticado')
    expect(vi.mocked(obtenerUltimoBriefing)).not.toHaveBeenCalled()
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('devuelve 404 si todavía no hay briefings', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(obtenerUltimoBriefing).mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).error).toBe('No hay briefings generados todavía')
  })

  it('con staff devuelve el último briefing completo', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    vi.mocked(obtenerUltimoBriefing).mockResolvedValue(BRIEFING)
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
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
    vi.mocked(obtenerUltimoBriefing).mockResolvedValue(rechazado)
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.salidaIa).toBeNull()
    const serializado = JSON.stringify(body)
    expect(serializado).not.toContain('TEXTO_CRUDO_DEL_MODELO_RECHAZADO_NO_DEBE_APARECER')
    expect(serializado).not.toContain('no debe salir')
  })
})
