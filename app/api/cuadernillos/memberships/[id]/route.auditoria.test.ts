import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletMembership, user } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } as Record<string, unknown>,
}))

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      observarUsuarioAuditoria(mocks.actor as Parameters<typeof observarUsuarioAuditoria>[0])
      return mocks.actor
    }),
  }
})
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn(async () => null) }))

usarDbTemporal('memberships-revocar-auditoria-')

import { DELETE } from './route'

const MEMBERSHIP = 'membresia-revocar-1'
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/cuadernillos/memberships/${id}`, { method: 'DELETE' })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function revocadaEn(id: string) {
  const [fila] = await getDb().select({ revokedAt: bookletMembership.revokedAt }).from(bookletMembership).where(eq(bookletMembership.id, id))
  return fila?.revokedAt ?? null
}

beforeEach(async () => {
  mocks.actor = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  await getDb().insert(user).values([
    { id: 'admin-1', name: 'Admin', email: 'admin-1@example.org', emailVerified: true, banned: false, role: 'admin' },
    { id: 'docente-9', name: 'Docente', email: 'docente-9@example.org', emailVerified: true, banned: false },
  ]).onConflictDoNothing()
  await getDb().insert(bookletMembership).values({
    id: MEMBERSHIP, userId: 'docente-9', capability: 'cabecera', grantedByUserId: 'admin-1', revokedAt: null,
  }).onConflictDoNothing()
  await getDb().update(bookletMembership).set({ revokedAt: null }).where(eq(bookletMembership.id, MEMBERSHIP))
})

describe('auditoría de revocación de cuadernillos', () => {
  it('revocar deja cuadernillo.membresia_revocar con el ejecutor y la membresía como objeto', async () => {
    const res = await DELETE(deleteReq(MEMBERSHIP), context(MEMBERSHIP))

    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.membresia_revocar',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'membresia',
      objetoId: MEMBERSHIP,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await revocadaEn(MEMBERSHIP)).not.toBeNull()
  })

  it('membresía inexistente deja invalido y no cambia nada', async () => {
    const res = await DELETE(deleteReq('no-existe'), context('no-existe'))

    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ accion: 'cuadernillo.membresia_revocar', resultado: 'invalido', objetoId: 'no-existe' })
  })

  it('si no se puede guardar el evento la membresía sigue activa y responde 503', async () => {
    const res = await conFalloAuditoria(() => DELETE(deleteReq(MEMBERSHIP), context(MEMBERSHIP)))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await revocadaEn(MEMBERSHIP)).toBeNull()
  })
})
