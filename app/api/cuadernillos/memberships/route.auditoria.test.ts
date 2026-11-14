import { eq, and, isNull } from 'drizzle-orm'
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

usarDbTemporal('memberships-auditoria-')

import { POST } from './route'

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/memberships', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function activas(userId: string, capability: string) {
  return getDb().select({ id: bookletMembership.id }).from(bookletMembership)
    .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, capability), isNull(bookletMembership.revokedAt)))
}

beforeEach(async () => {
  mocks.actor = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  await getDb().insert(user).values([
    { id: 'admin-1', name: 'Admin', email: 'admin-1@example.org', emailVerified: true, banned: false, role: 'admin' },
    { id: 'docente-2', name: 'Docente', email: 'docente-2@example.org', emailVerified: true, banned: false },
    { id: 'baneado-3', name: 'Baneado', email: 'baneado-3@example.org', emailVerified: true, banned: true },
  ]).onConflictDoNothing()
})

describe('auditoría de otorgamiento de cuadernillos', () => {
  it('otorgar deja cuadernillo.membresia_otorgar con el id de la membresía y capability como campo', async () => {
    const res = await POST(postReq({ userId: 'docente-2', capability: 'cabecera' }))

    expect(res.status).toBe(201)
    const { membership } = await res.json()
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'cuadernillo.membresia_otorgar',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'membresia',
      objetoId: membership.id,
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(evento.metadatos).toMatchObject({ campos: ['capability'] })
    expect(JSON.stringify(evento)).not.toContain('docente-2@example.org')
  })

  it('repetir el mismo otorgamiento deja resultado repetido y no duplica la membresía', async () => {
    await POST(postReq({ userId: 'docente-2', capability: 'planning' }))

    const res = await POST(postReq({ userId: 'docente-2', capability: 'planning' }))

    expect(res.status).toBe(201)
    expect(await eventoDe(res)).toMatchObject({ accion: 'cuadernillo.membresia_otorgar', resultado: 'repetido' })
    expect(await activas('docente-2', 'planning')).toHaveLength(1)
  })

  it('usuario baneado deja conflicto y no otorga nada', async () => {
    const res = await POST(postReq({ userId: 'baneado-3', capability: 'supervisor' }))

    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ accion: 'cuadernillo.membresia_otorgar', resultado: 'conflicto' })
    expect(await activas('baneado-3', 'supervisor')).toHaveLength(0)
  })

  it('cuerpo inválido deja invalido', async () => {
    const res = await POST(postReq({ userId: 'docente-2', capability: 'inventada' }))

    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'cuadernillo.membresia_otorgar', resultado: 'invalido' })
  })

  it('si no se puede guardar el evento revierte la membresía y responde 503', async () => {
    const res = await conFalloAuditoria(() => POST(postReq({ userId: 'docente-2', capability: 'supervisor' })))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await activas('docente-2', 'supervisor')).toHaveLength(0)
  })
})
