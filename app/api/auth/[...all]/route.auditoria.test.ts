import { eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from 'better-auth/crypto'
import type * as BetterAuthNextJs from 'better-auth/next-js'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { account, auditoriaEvento, session, user } from '@/lib/db/schema'

// Modo real: en los tests de better-auth real (describe al final) `mocks.real` enruta al handler verdadero
// sobre la base temporal; el resto de los tests usa el handler simulado.
const mocks = vi.hoisted(() => ({ respuesta: vi.fn(), real: false }))

vi.mock('better-auth/next-js', async (importOriginal) => {
  const actual = await importOriginal<typeof BetterAuthNextJs>()
  return {
    ...actual,
    toNextJsHandler: (authInstance: Parameters<typeof actual.toNextJsHandler>[0]) => {
      const real = actual.toNextJsHandler(authInstance)
      return { GET: real.GET, POST: (request: Request) => (mocks.real ? real.POST(request) : mocks.respuesta(request)) }
    },
  }
})
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

describe('better-auth real sobre la base temporal', () => {
  const PASS = 'clave-real-123'
  const DOCENTE = 'docente-real@example.org'
  const ADMIN = 'admin-real@example.org'

  beforeAll(async () => {
    mocks.real = true
    const db = getDb()
    for (const [id, email, role] of [['docente-real-1', DOCENTE, 'consulta'], ['admin-real-1', ADMIN, 'admin']] as const) {
      await db.insert(user).values({ id, name: id, email, emailVerified: true, banned: false, role }).onConflictDoNothing()
      await db.insert(account).values({
        id: `cuenta-${id}`, issuer: 'local:credential', accountId: id, providerId: 'credential', userId: id,
        password: await hashPassword(PASS),
      }).onConflictDoNothing()
    }
  })

  beforeEach(() => {
    mocks.real = true
  })

  function signIn(email: string): Request {
    return new Request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ email, password: PASS }),
    })
  }

  async function contarSesiones() {
    const [fila] = await getDb().select({ n: sql<number>`count(*)::int` }).from(session)
    return fila!.n
  }

  function cookiesDe(res: Response): string {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  }

  it('(a) inicio de sesión con falla de auditoría: 503, sin Set-Cookie y sin sesión huérfana', async () => {
    const antes = await contarSesiones()

    const res = await conFalloAuditoria(() => POST(signIn(DOCENTE)))

    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await contarSesiones()).toBe(antes)
  })

  it('(b) inicio de sesión sin falla: 200, una sesión nueva y un evento session.login_exito', async () => {
    const antes = await contarSesiones()

    const res = await POST(signIn(DOCENTE))

    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0)
    expect(await contarSesiones()).toBe(antes + 1)
    const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
    const eventos = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'session.login_exito', resultado: 'exito', httpStatus: 200 })
  })

  it('(c) baneo de admin por el catch-all con falla de auditoría: revierte el baneo', async () => {
    const adminSesion = await POST(signIn(ADMIN))
    expect(adminSesion.status).toBe(200)
    const cookie = cookiesDe(adminSesion)
    const objetivo = 'docente-real-1'

    const res = await conFalloAuditoria(() => POST(new Request('http://localhost/api/auth/admin/ban-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
      body: JSON.stringify({ userId: objetivo, banReason: 'prueba' }),
    })))

    expect(res.status).toBe(503)
    const [fila] = await getDb().select({ banned: user.banned }).from(user).where(eq(user.id, objetivo))
    expect(fila?.banned).toBe(false)
  })

  it('(c) control: el mismo baneo sin falla queda aplicado y auditado', async () => {
    const cookie = cookiesDe(await POST(signIn(ADMIN)))
    const objetivo = 'docente-real-1'

    const res = await POST(new Request('http://localhost/api/auth/admin/ban-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
      body: JSON.stringify({ userId: objetivo, banReason: 'prueba' }),
    }))

    expect(res.status).toBe(200)
    const [fila] = await getDb().select({ banned: user.banned }).from(user).where(eq(user.id, objetivo))
    expect(fila?.banned).toBe(true)
    const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
    const eventos = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'cuenta.operacion', resultado: 'exito' })
  })
})
