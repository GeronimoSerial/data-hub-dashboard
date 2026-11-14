import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, nivelesJurisdiccionales, user, userNivelesJur } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin-1', role: 'admin', banned: false } as { id: string; role: string; banned: boolean } | null,
  setRole: vi.fn(),
}))

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      observarUsuarioAuditoria(mocks.actor)
      return mocks.actor
    }),
  }
})
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      setRole: (...args: unknown[]) => mocks.setRole(...args),
      banUser: vi.fn(async () => ({})), unbanUser: vi.fn(async () => ({})),
      setUserPassword: vi.fn(async () => ({})), adminUpdateUser: vi.fn(async () => ({})),
    },
  },
}))
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: vi.fn(async () => true) }))

usarDbTemporal('usuarios-editar-auditoria-')

import { PATCH } from './route'

const TARGET = 'objetivo-1'
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function patchReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/usuarios/${id}`, {
    method: 'PATCH',
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

async function dosNiveles() {
  const filas = await getDb().select({ id: nivelesJurisdiccionales.id }).from(nivelesJurisdiccionales).limit(2)
  expect(filas.length).toBe(2)
  return [filas[0]!.id, filas[1]!.id] as const
}

beforeEach(async () => {
  mocks.actor = { id: 'admin-1', role: 'admin', banned: false }
  mocks.setRole.mockReset()
  mocks.setRole.mockResolvedValue({})
  await getDb().insert(user).values({ id: TARGET, name: 'Objetivo', email: `${TARGET}@example.org`, banned: false, role: 'consulta' })
    .onConflictDoNothing()
})

describe('auditoría de cambios de usuarios', () => {
  it('cambio de rol deja usuario.modificar con el campo role y sin el valor', async () => {
    const res = await PATCH(patchReq(TARGET, { role: 'editor' }), context(TARGET))

    expect(res.status).toBe(200)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'usuario.modificar',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'usuario',
      objetoId: TARGET,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(evento.metadatos).toMatchObject({ campos: ['role'] })
    expect(JSON.stringify(evento.metadatos)).not.toContain('editor')
  })

  it('cuerpo inválido deja usuario.modificar con resultado invalido', async () => {
    const res = await PATCH(patchReq(TARGET, { role: 'no-existe' }), context(TARGET))

    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.modificar', resultado: 'invalido', objetoId: TARGET })
  })

  it('usuario inexistente deja invalido con el id solicitado', async () => {
    const res = await PATCH(patchReq('no-existe', { role: 'editor' }), context('no-existe'))

    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.modificar', resultado: 'invalido', objetoId: 'no-existe' })
  })

  it('si no se puede guardar el evento revierte los niveles y responde 503', async () => {
    const [anterior, nuevo] = await dosNiveles()
    await getDb().insert(userNivelesJur).values({ userId: TARGET, nivelJurisdiccionalId: anterior }).onConflictDoNothing()

    const res = await conFalloAuditoria(() => PATCH(patchReq(TARGET, { nivelJurIds: [nuevo] }), context(TARGET)))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    const niveles = await getDb().select().from(userNivelesJur).where(eq(userNivelesJur.userId, TARGET))
    expect(niveles.map((n) => n.nivelJurisdiccionalId)).toEqual([anterior])
  })

  it('un cambio de niveles deja campos con el nombre nivelJurIds', async () => {
    const [, nuevo] = await dosNiveles()

    const res = await PATCH(patchReq(TARGET, { nivelJurIds: [nuevo] }), context(TARGET))

    expect(res.status).toBe(200)
    expect((await eventoDe(res)).metadatos).toMatchObject({ campos: ['nivelJurIds'] })
  })
})
