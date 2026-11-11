import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'
import type { Role } from '@/lib/acl'

// Mismo patrón que app/api/infraestructura/motivos/route.test.ts: staffGuard
// reimplementado acá para no arrastrar la cadena de @/lib/auth al cargar.
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

usarDbTemporal('llamadas-route-')

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function sesion(role: Role = 'admin') {
  return {
    id: `${role}-1`,
    role,
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}

const CUE = '1234567-01'

function postReq(body: unknown) {
  return new Request('http://localhost/api/call-center/llamadas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
function getReq(cue?: string) {
  const query = cue === undefined ? '' : `?cue=${encodeURIComponent(cue)}`
  return new Request(`http://localhost/api/call-center/llamadas${query}`)
}
function entradaValida(extra: Record<string, unknown> = {}) {
  return {
    cueAnexo: CUE,
    callerNombre: 'Ana Pérez',
    justificacion: 'El director estaba de licencia',
    respuestaDirector: 'Lo cargará la semana próxima',
    ...extra,
  }
}

describe('POST /api/call-center/llamadas', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(postReq(entradaValida()))
    expect(res.status).toBe(401)
  })

  it('rechaza a operador_establecimiento con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion('operador_establecimiento' as Role))
    const { POST } = await import('./route')
    const res = await POST(postReq(entradaValida()))
    expect(res.status).toBe(403)
  })

  it('rechaza un body que no es JSON con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion())
    const { POST } = await import('./route')
    const res = await POST(postReq('{no es json'))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
  })

  it('rechaza un campo inválido con 400 y el mensaje del validador', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion())
    const { POST } = await import('./route')
    const res = await POST(postReq(entradaValida({ callerNombre: '   ' })))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'El nombre de quien llama es obligatorio' })
  })

  it('persiste la llamada con el usuario de la sesión, ignorando usuarioId del body', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion('admin'))
    const { POST } = await import('./route')
    const res = await POST(postReq(entradaValida({ usuarioId: 'otro' })))
    expect(res.status).toBe(201)
    const { llamada } = await res.json()
    expect(llamada.usuarioId).toBe('admin-1')

    const { listarLlamadasPorCue } = await import('@/lib/call-center/llamadas')
    const guardadas = await listarLlamadasPorCue(CUE)
    const fila = guardadas.find((l) => l.id === llamada.id)
    expect(fila?.usuarioId).toBe('admin-1')
    expect(fila?.callerNombre).toBe('Ana Pérez')
  })
})

describe('GET /api/call-center/llamadas', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(getReq(CUE))
    expect(res.status).toBe(401)
  })

  it('rechaza a operador_establecimiento con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion('operador_establecimiento' as Role))
    const { GET } = await import('./route')
    const res = await GET(getReq(CUE))
    expect(res.status).toBe(403)
  })

  it('devuelve las llamadas del CUE de la más nueva a la más vieja', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion())
    const { registrarLlamada } = await import('@/lib/call-center/llamadas')
    const otroCue = '7654321-02'
    const vieja = await registrarLlamada(
      { ...entradaValida({ cueAnexo: otroCue }), usuarioId: 'admin-1' },
      new Date('2026-03-01T10:00:00Z'),
    )
    const nueva = await registrarLlamada(
      { ...entradaValida({ cueAnexo: otroCue, callerNombre: 'Luis' }), usuarioId: 'admin-1' },
      new Date('2026-03-02T10:00:00Z'),
    )

    const { GET } = await import('./route')
    const res = await GET(getReq(otroCue))
    expect(res.status).toBe(200)
    const { llamadas } = await res.json()
    expect(llamadas.map((l: { id: string }) => l.id)).toEqual([nueva.id, vieja.id])
  })

  it('rechaza un CUE inválido con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sesion())
    const { GET } = await import('./route')
    const res = await GET(getReq('abc'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'CUE inválido' })
  })
})
