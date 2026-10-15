import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
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

usarDbTemporal('verificaciones-responder-')

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
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

function responder(id: string, body: unknown) {
  const request = new Request(
    `http://localhost/api/infraestructura/verificaciones/${id}/responder-asistida`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return { request, context: { params: Promise.resolve({ id }) } }
}

let POST: typeof Ruta.POST
beforeAll(async () => { POST = (await import('./route')).POST })

describe('POST /api/infraestructura/verificaciones/[id]/responder-asistida', () => {
  it.each([
    ['rechaza sin sesión con 401', null, 401],
    ['rechaza a consulta (no staff) con 403', consulta(), 403],
  ] as const)('%s', async (_titulo, user, status) => {
    vi.mocked(getSessionUser).mockResolvedValue(user)
    const { request, context } = responder('cualquiera', {
      canal: 'telefono',
      resultado: 'sin_afectacion',
    })
    const res = await POST(request, context)
    expect(res.status).toBe(status)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('responde sin_afectacion por teléfono sobre una pendiente', async () => {
    const creada = await crearPendiente('CUE-ASISTIDA-OK')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { request, context } = responder(creada.verificacion.id, {
      canal: 'telefono',
      resultado: 'sin_afectacion',
    })
    const res = await POST(request, context)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.verificacion.estado).toBe('respondida')
    expect(data.verificacion.resultado).toBe('sin_afectacion')
    expect(data.verificacion.respondidaCanal).toBe('telefono')
    expect('tokenHash' in data.verificacion).toBe(false)
  })

  it('rechaza con_afectacion con 400 desde el parseo de Zod sin lanzar excepción', async () => {
    const creada = await crearPendiente('CUE-ASISTIDA-AFECTACION')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { request, context } = responder(creada.verificacion.id, {
      canal: 'telefono',
      resultado: 'con_afectacion',
    })
    const res = await POST(request, context)
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(typeof data.error).toBe('string')
  })

  it('ignora un movimientoId extra en el body (Zod lo descarta)', async () => {
    const creada = await crearPendiente('CUE-ASISTIDA-IGNORA-MOVIMIENTO')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { request, context } = responder(creada.verificacion.id, {
      canal: 'telefono',
      resultado: 'sin_afectacion',
      movimientoId: 'movimiento-que-no-deberia-usarse',
    })
    const res = await POST(request, context)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.verificacion.movimientoId).toBeNull()
  })

  it('responde dos veces con el mismo resultado (replay idempotente)', async () => {
    const creada = await crearPendiente('CUE-ASISTIDA-REPLAY')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const primera = responder(creada.verificacion.id, {
      canal: 'whatsapp',
      resultado: 'no_disponible',
    })
    const res1 = await POST(primera.request, primera.context)
    expect(res1.status).toBe(200)

    const segunda = responder(creada.verificacion.id, {
      canal: 'whatsapp',
      resultado: 'no_disponible',
    })
    const res2 = await POST(segunda.request, segunda.context)
    expect(res2.status).toBe(200)
    const data = await res2.json()
    expect(data.ok).toBe(true)
    expect(data.verificacion.resultado).toBe('no_disponible')
  })

  it('devuelve 409 si el segundo resultado contradice al primero', async () => {
    const creada = await crearPendiente('CUE-ASISTIDA-CONTRADICCION')
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const primera = responder(creada.verificacion.id, {
      canal: 'presencial',
      resultado: 'sin_afectacion',
    })
    const res1 = await POST(primera.request, primera.context)
    expect(res1.status).toBe(200)

    const segunda = responder(creada.verificacion.id, {
      canal: 'presencial',
      resultado: 'no_disponible',
    })
    const res2 = await POST(segunda.request, segunda.context)
    expect(res2.status).toBe(409)
    const data = await res2.json()
    expect(data.error).toBe('La verificación ya fue respondida con otro resultado')
  })
})
