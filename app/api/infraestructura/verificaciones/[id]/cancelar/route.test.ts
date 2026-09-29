import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

// No usa importOriginal: el módulo real importa @/lib/auth -> @/lib/db, que
// llamaría getDb() (y cachearía la conexión) al cargar el módulo, ANTES de
// que el beforeAll de este archivo fije DATA_DIR. Reimplementa staffGuard acá
// mismo (misma lógica que lib/session.ts) para no arrastrar esa cadena.
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

usarDbTemporal('verificaciones-cancelar-')

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

async function crearPendiente(cueAnexo: string) {
  const { crearVerificacion } = await import('@/lib/infraestructura/verificaciones')
  const creada = await crearVerificacion({
    cueAnexo,
    solicitadaPorUserId: 'editor-1',
  })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function cancelar(id: string, body?: unknown) {
  const request = new Request(
    `http://localhost/api/infraestructura/verificaciones/${id}/cancelar`,
    {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
  return { request, context: { params: Promise.resolve({ id }) } }
}

describe('POST /api/infraestructura/verificaciones/[id]/cancelar', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { POST } = await import('./route')
    const { request, context } = cancelar('cualquiera', {})
    const res = await POST(request, context)
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { POST } = await import('./route')
    const { request, context } = cancelar('cualquiera', {})
    const res = await POST(request, context)
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('cancela una verificación pendiente', async () => {
    const creada = await crearPendiente('CUE-CANCELA-OK')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const { request, context } = cancelar(creada.verificacion.id, { motivo: 'duplicada' })
    const res = await POST(request, context)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.verificacion.estado).toBe('cancelada')
    expect(data.verificacion.motivoCancelacion).toBe('duplicada')
    expect('tokenHash' in data.verificacion).toBe(false)
  })

  it('devuelve 409 si ya estaba cancelada', async () => {
    const creada = await crearPendiente('CUE-CANCELA-DOBLE')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')

    const primerIntento = cancelar(creada.verificacion.id)
    const primera = await POST(primerIntento.request, primerIntento.context)
    expect(primera.status).toBe(200)

    const { request, context } = cancelar(creada.verificacion.id, {})
    const res = await POST(request, context)
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('La verificación ya estaba cancelada')
  })

  it('devuelve 409 si ya fue respondida', async () => {
    const creada = await crearPendiente('CUE-CANCELA-RESPONDIDA')
    const { responderPorEnlace } = await import('@/lib/infraestructura/verificaciones')
    const respuesta = await responderPorEnlace({
      verificacionId: creada.verificacion.id,
      token: creada.token,
      resultado: 'sin_afectacion',
    })
    expect(respuesta.ok).toBe(true)

    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const { request, context } = cancelar(creada.verificacion.id, {})
    const res = await POST(request, context)
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('La verificación ya fue respondida')
  })

  it('devuelve 404 si el id no existe', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const { request, context } = cancelar('verificacion-inexistente', {})
    const res = await POST(request, context)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('La verificación no existe')
  })
})
