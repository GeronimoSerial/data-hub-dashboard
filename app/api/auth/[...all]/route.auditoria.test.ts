import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'

const mocks = vi.hoisted(() => ({ respuesta: vi.fn() }))

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: mocks.respuesta }),
}))
vi.mock('@/lib/auth', () => ({ auth: {} }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => null) }))

usarDbTemporal('auth-auditoria-')

import { POST } from './route'

const EMAIL = 'docente-secreto@example.org'
const PASSWORD = 'clave-muy-secreta-123'

function postReq(path: string, body: unknown = { email: EMAIL, password: PASSWORD }): Request {
  return new Request(`http://localhost${path}`, {
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
  mocks.respuesta.mockReset()
})

describe('auditoría del catch-all de better-auth', () => {
  it('inicio de sesión exitoso deja session.login_exito y conserva Set-Cookie', async () => {
    mocks.respuesta.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'session_token=TOKEN-SECRETO; Path=/; HttpOnly' },
    }))

    const res = await POST(postReq('/api/auth/sign-in/email'))

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('session_token=TOKEN-SECRETO')
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'session.login_exito',
      metodo: 'POST',
      rutaPlantilla: '/api/auth/[...all]',
      actorTipo: 'anonimo',
      resultado: 'exito',
      httpStatus: 200,
    })
  })

  it('inicio de sesión fallido deja session.login_fallo sin guardar la contraseña ni el correo', async () => {
    mocks.respuesta.mockResolvedValue(Response.json({ message: 'Invalid' }, { status: 401 }))

    const res = await POST(postReq('/api/auth/sign-in/email'))

    expect(res.status).toBe(401)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ accion: 'session.login_fallo', resultado: 'rechazado', httpStatus: 401 })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(PASSWORD)
    expect(serializado).not.toContain(EMAIL)
  })

  it('cierre de sesión exitoso y fallido quedan como logout_exito y logout_fallo', async () => {
    mocks.respuesta.mockResolvedValueOnce(Response.json({ success: true }, { status: 200 }))
    const ok = await POST(postReq('/api/auth/sign-out', {}))
    expect(await eventoDe(ok)).toMatchObject({ accion: 'session.logout_exito', resultado: 'exito' })

    mocks.respuesta.mockResolvedValueOnce(Response.json({ message: 'boom' }, { status: 500 }))
    const fallo = await POST(postReq('/api/auth/sign-out', {}))
    expect(await eventoDe(fallo)).toMatchObject({ accion: 'session.logout_fallo', resultado: 'error' })
  })

  it('otras operaciones de cuenta no se registran como inicio de sesión', async () => {
    mocks.respuesta.mockResolvedValue(Response.json({ ok: true }, { status: 200 }))

    const res = await POST(postReq('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: PASSWORD }))

    expect((await eventoDe(res)).accion).toBe('cuenta.operacion')
  })

  it('si no se puede guardar el evento responde 503 sin Set-Cookie', async () => {
    mocks.respuesta.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'session_token=TOKEN-SECRETO; Path=/' },
    }))

    const res = await conFalloAuditoria(() => POST(postReq('/api/auth/sign-in/email')))

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
