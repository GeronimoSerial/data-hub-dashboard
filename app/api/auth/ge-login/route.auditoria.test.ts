import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({ manejar: vi.fn() }))

vi.mock('@/lib/ge-sso/handlers', () => ({
  manejarGeLogin: mocks.manejar,
  responderPreflightGe: vi.fn(),
}))

usarDbTemporal('ge-login-auditoria-')

import { POST } from './route'

const TICKET = 'TICKET-SECRETO-ABC-123'

function postReq(body: unknown = { ticket: TICKET }): Request {
  return new Request('http://localhost/api/auth/ge-login', {
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

beforeEach(() => {
  mocks.manejar.mockReset()
})

describe('auditoría del login por GE', () => {
  it('login exitoso deja session.login_exito y conserva Set-Cookie', async () => {
    mocks.manejar.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'session_token=SESION-SECRETA; Path=/' },
    }))

    const res = await POST(postReq())

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('session_token=SESION-SECRETA')
    expect(await eventoDe(res)).toMatchObject({
      accion: 'session.login_exito',
      metodo: 'POST',
      rutaPlantilla: '/api/auth/ge-login',
      actorTipo: 'anonimo',
      resultado: 'exito',
      httpStatus: 200,
    })
  })

  it('ticket inválido deja session.login_fallo y no guarda el ticket', async () => {
    mocks.manejar.mockResolvedValue(Response.json({ error: 'ticket inválido' }, { status: 401 }))

    const res = await POST(postReq())

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ accion: 'session.login_fallo', resultado: 'rechazado', httpStatus: 401 })
    expect(JSON.stringify(evento)).not.toContain(TICKET)
  })

  it('un error inesperado del handler queda como session.login_fallo', async () => {
    mocks.manejar.mockRejectedValue(new Error('falla interna'))

    const res = await POST(postReq())

    expect(res.status).toBe(500)
    expect(await eventoDe(res)).toMatchObject({ accion: 'session.login_fallo', resultado: 'error' })
  })

  it('si no se puede guardar el evento responde 503 sin Set-Cookie', async () => {
    mocks.manejar.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'session_token=SESION-SECRETA; Path=/' },
    }))

    const res = await conFalloAuditoria(() => POST(postReq()))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
