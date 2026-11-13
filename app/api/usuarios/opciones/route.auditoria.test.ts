import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { auditoriaEvento, user } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin-1', role: 'admin', banned: false } as { id: string; role: string; banned: boolean } | null,
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
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: vi.fn(async () => true) }))

usarDbTemporal('usuarios-opciones-auditoria-')

import { POST } from './route'

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/usuarios/opciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const permisos = { role: 'consulta', nivelJurIds: [], recursoIds: [], accesoRecursos: 'todos' }

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

beforeEach(async () => {
  mocks.actor = { id: 'admin-1', role: 'admin', banned: false }
  await getDb().insert(user).values({ id: 'existente-1', name: 'Existente', email: 'existente-1@example.org', banned: false, role: 'consulta' })
    .onConflictDoNothing()
})

describe('auditoría de opciones de permisos de usuarios', () => {
  it('sin userId el evento es usuario.crear', async () => {
    const res = await POST(postReq(permisos))

    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'usuario.crear', actorId: 'admin-1', objetoTipo: 'usuario', objetoId: null, resultado: 'exito',
    })
  })

  it('con userId existente el evento es usuario.modificar sobre ese usuario', async () => {
    const res = await POST(postReq({ ...permisos, userId: 'existente-1' }))

    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'usuario.modificar', objetoTipo: 'usuario', objetoId: 'existente-1', resultado: 'exito',
    })
  })

  it('cuerpo inválido deja invalido', async () => {
    const res = await POST(postReq({ role: 'no-existe' }))

    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.crear', resultado: 'invalido' })
  })

  it('sin permiso de administración deja rechazado', async () => {
    mocks.actor = { id: 'editor-1', role: 'editor', banned: false }

    const res = await POST(postReq(permisos))

    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ accion: 'usuario.crear', resultado: 'rechazado', actorId: 'editor-1' })
  })
})
