import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { GET } from './route'

const sesion = vi.hoisted(() => ({ user: null as null | { id: string; role: string; banned: boolean; nivelJurIds: number[]; accesoRecursos: 'todos'; recursoIds: string[] } }))

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      observarUsuarioAuditoria(sesion.user)
      return sesion.user
    }),
    staffGuard: (user: { banned: boolean; role: string } | null) => {
      if (!user) return { status: 401 as const, error: 'No autenticado' }
      if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
        return { status: 403 as const, error: 'No tiene acceso a este recurso' }
      }
      return null
    },
  }
})

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({ cargarEventosTerreno: vi.fn(async () => []) }))

usarDbTemporal('veredicto-pdf-auditoria-')

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] })

function req(qs = '?desde=2026-01-05&hasta=2026-01-05'): Request {
  return new Request(`http://localhost/api/infraestructura/veredictos/pdf${qs}`)
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

beforeEach(() => {
  sesion.user = admin()
})

describe('auditoría del PDF de veredictos', () => {
  it('una descarga exitosa deja un evento veredicto.pdf con el usuario y solo formato y cantidad', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'veredicto.pdf',
      metodo: 'GET',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      actorRol: 'admin',
      viaAcceso: 'sesion',
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { formato: 'pdf', cantidad: 0 },
    })
  })

  it('un rango inválido deja un evento invalido', async () => {
    const res = await GET(req('?desde=2026-13-01&hasta=2026-01-05'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'veredicto.pdf', resultado: 'invalido', httpStatus: 400 })
  })

  it('sin sesión deja un rechazo 401 sin identidad', async () => {
    sesion.user = null
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'veredicto.pdf', actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401,
    })
  })

  it('si no se puede registrar la auditoría responde 503 y no entrega el PDF', async () => {
    const antes = await getDb().select().from(auditoriaEvento)
    const res = await conFalloAuditoria(() => GET(req()))
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Disposition')).toBeNull()
    expect((await res.json()).code).toBe('auditoria_no_disponible')
    expect(await getDb().select().from(auditoriaEvento)).toHaveLength(antes.length)
  })
})
