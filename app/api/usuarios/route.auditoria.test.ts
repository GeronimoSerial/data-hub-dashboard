import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, nivelesJurisdiccionales, user, userNivelesJur } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin-1', role: 'admin', banned: false } as { id: string; role: string; banned: boolean } | null,
  createUser: vi.fn(),
  removeUser: vi.fn(),
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
  auth: { api: { createUser: (...args: unknown[]) => mocks.createUser(...args), removeUser: (...args: unknown[]) => mocks.removeUser(...args) } },
}))
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: vi.fn(async () => true) }))

usarDbTemporal('usuarios-crear-auditoria-')

import { POST } from './route'

const PASSWORD = 'clave-nueva-secreta-1'
const EMAIL = 'nuevo-secreto@example.org'

async function nivelId() {
  const [nivel] = await getDb().select({ id: nivelesJurisdiccionales.id }).from(nivelesJurisdiccionales).limit(1)
  return nivel!.id
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/usuarios', {
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

// Better Auth crea la cuenta por su propio adaptador, fuera de la transacción del evento:
// la fila ya existe antes del pedido (baneada, como la deja Provisioning).
async function simularCreacion(id: string) {
  await getDb().insert(user).values({ id, name: 'Nuevo', email: `${id}@example.org`, banned: true })
  mocks.createUser.mockResolvedValue({ user: { id } })
}

beforeEach(() => {
  mocks.actor = { id: 'admin-1', role: 'admin', banned: false }
  mocks.createUser.mockReset()
  mocks.removeUser.mockReset()
})

describe('auditoría de alta de usuarios', () => {
  it('alta exitosa deja usuario.crear con el admin como actor y solo nombres de campos', async () => {
    const nivel = await nivelId()
    await simularCreacion('nuevo-ok-1')

    const res = await POST(postReq({
      email: EMAIL, name: 'Nuevo', password: PASSWORD, role: 'consulta',
      nivelJurIds: [nivel], accesoRecursos: 'todos', recursoIds: [],
    }))

    expect(res.status).toBe(201)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'usuario.crear',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'usuario',
      objetoId: 'nuevo-ok-1',
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(evento.metadatos).toMatchObject({ campos: expect.arrayContaining(['role', 'nivelJurIds']) })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(PASSWORD)
    expect(serializado).not.toContain(EMAIL)
  })

  it('cuerpo inválido deja usuario.crear con resultado invalido y no crea nada', async () => {
    const res = await POST(postReq({ email: EMAIL }))

    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.crear', resultado: 'invalido', httpStatus: 400 })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('sin permiso de administración deja rechazado y no crea el usuario', async () => {
    mocks.actor = { id: 'editor-1', role: 'editor', banned: false }

    const res = await POST(postReq({ email: EMAIL, name: 'x', password: PASSWORD, role: 'consulta', nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }))

    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.crear', resultado: 'rechazado' })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('si no se puede guardar el evento revierte la configuración y responde 503', async () => {
    const nivel = await nivelId()
    await simularCreacion('nuevo-falla-1')

    const res = await conFalloAuditoria(() => POST(postReq({
      email: EMAIL, name: 'Nuevo', password: PASSWORD, role: 'consulta',
      nivelJurIds: [nivel], accesoRecursos: 'todos', recursoIds: [],
    })))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    const [fila] = await getDb().select({ banned: user.banned }).from(user).where(eq(user.id, 'nuevo-falla-1'))
    expect(fila?.banned).toBe(true)
    const niveles = await getDb().select().from(userNivelesJur).where(eq(userNivelesJur.userId, 'nuevo-falla-1'))
    expect(niveles).toHaveLength(0)
  })
})
