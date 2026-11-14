import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from 'better-auth/crypto'
import type * as BetterAuthNextJs from 'better-auth/next-js'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { account, auditoriaEvento, user } from '@/lib/db/schema'

// Modo real: en el describe final `mocks.real` enruta al handler verdadero de better-auth.
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

usarDbTemporal('login-actor-auditoria-')

import { POST } from './route'

const EMAIL = 'docente-actor-secreto@example.org'
const PASSWORD = 'clave-actor-secreta-123'
const TOKEN = 'TOKEN-ACTOR-SECRETO'

function postReq(path: string, body: unknown = { email: EMAIL, password: PASSWORD }): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
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

describe('actor del evento de inicio de sesión', () => {
  it('inicio exitoso guarda como actor al usuario autenticado y conserva el cuerpo y la cookie', async () => {
    const cuerpo = { redirect: false, token: TOKEN, user: { id: 'usuario-mock-1', role: 'consulta', email: EMAIL } }
    mocks.respuesta.mockResolvedValue(new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': `session_token=${TOKEN}; Path=/; HttpOnly` },
    }))

    const res = await POST(postReq('/api/auth/sign-in/email'))

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain(`session_token=${TOKEN}`)
    expect(await res.json()).toEqual(cuerpo)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'session.login_exito',
      actorTipo: 'usuario',
      actorId: 'usuario-mock-1',
      actorRol: 'consulta',
      viaAcceso: 'sesion',
      resultado: 'exito',
    })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(TOKEN)
    expect(serializado).not.toContain(PASSWORD)
    expect(serializado).not.toContain(EMAIL)
  })

  it('una respuesta 200 sin usuario (p. ej. un paso intermedio) queda como anónimo', async () => {
    mocks.respuesta.mockResolvedValue(Response.json({ twoFactorRedirect: true }, { status: 200 }))

    const evento = await eventoDe(await POST(postReq('/api/auth/sign-in/email')))

    expect(evento).toMatchObject({ accion: 'session.login_exito', actorTipo: 'anonimo', actorId: null })
  })

  it('inicio fallido queda como anónimo y sin contraseña ni correo', async () => {
    mocks.respuesta.mockResolvedValue(Response.json({ message: 'Invalid', user: { id: 'no-debe-usarse' } }, { status: 401 }))

    const res = await POST(postReq('/api/auth/sign-in/email'))

    expect(res.status).toBe(401)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ accion: 'session.login_fallo', actorTipo: 'anonimo', actorId: null, resultado: 'rechazado' })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(PASSWORD)
    expect(serializado).not.toContain(EMAIL)
  })
})

describe('better-auth real: el actor es el usuario que inició sesión', () => {
  const PASS = 'clave-login-real-123'
  const ID = 'usuario-login-real-1'
  const CORREO = 'usuario-login-real@example.org'

  beforeAll(async () => {
    mocks.real = true
    const db = getDb()
    await db.insert(user).values({ id: ID, name: ID, email: CORREO, emailVerified: true, banned: false, role: 'consulta' }).onConflictDoNothing()
    await db.insert(account).values({
      id: `cuenta-${ID}`, issuer: 'local:credential', accountId: ID, providerId: 'credential', userId: ID,
      password: await hashPassword(PASS),
    }).onConflictDoNothing()
  })

  beforeEach(() => {
    mocks.real = true
  })

  it('el evento guarda el id real del usuario y el cuerpo de better-auth sigue legible', async () => {
    const res = await POST(postReq('/api/auth/sign-in/email', { email: CORREO, password: PASS }))

    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0)
    const cuerpo = await res.json() as { user: { id: string } }
    expect(cuerpo.user.id).toBe(ID)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'session.login_exito',
      actorTipo: 'usuario',
      actorId: ID,
      resultado: 'exito',
    })
  })
})
