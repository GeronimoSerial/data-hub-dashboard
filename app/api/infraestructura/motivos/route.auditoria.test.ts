import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraMotivo } from '@/lib/db/schema'
import { DELETE, POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const user = sesionDePrueba.user
      observarUsuarioAuditoria(user)
      return user
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

const sesionDePrueba: { user: { id: string; role: string; banned: boolean } | null } = { user: null }

usarDbTemporal('motivos-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const editor = () => ({ id: 'editor-1', role: 'editor', banned: false })

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/infraestructura/motivos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/infraestructura/motivos?id=${id}`, { method: 'DELETE' })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de motivos de infraestructura', () => {
  it('guardar un motivo deja un evento motivo.guardar del admin', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await POST(postReq({ id, nombre: `Motivo ${id}`, categoria: 'establecimiento' }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'motivo.guardar',
      metodo: 'POST',
      rutaPlantilla: '/api/infraestructura/motivos',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'motivo',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
    })
  })

  it('nombre duplicado deja un evento invalido y no crea otra fila', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    const nombre = `Duplicado ${id}`
    await POST(postReq({ id, nombre, categoria: 'establecimiento' }))

    const res = await POST(postReq({ id: randomUUID(), nombre, categoria: 'establecimiento' }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.nombre, nombre))).toHaveLength(1)
  })

  it('editor sin rol admin deja un evento rechazado y no guarda', async () => {
    sesionDePrueba.user = editor()
    const id = randomUUID()

    const res = await POST(postReq({ id, nombre: `Editor ${id}`, categoria: 'establecimiento' }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'editor-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.id, id))).toHaveLength(0)
  })

  it('eliminar un motivo deja un evento motivo.eliminar del admin', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    await getDb().insert(infraMotivo).values({ id, nombre: `Borrable ${id}`, categoria: 'establecimiento', orden: 0 })

    const res = await DELETE(deleteReq(id))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'motivo.eliminar',
      metodo: 'DELETE',
      actorId: 'admin-1',
      objetoTipo: 'motivo',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.id, id))).toHaveLength(0)
  })

  it('si no se puede registrar la auditoría responde 503 y el motivo no se guarda', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await conFalloAuditoria(() => POST(postReq({ id, nombre: `Fallo ${id}`, categoria: 'establecimiento' })))
    expect(res.status).toBe(503)
    expect(await getDb().select().from(infraMotivo).where(eq(infraMotivo.id, id))).toHaveLength(0)
  })
})
