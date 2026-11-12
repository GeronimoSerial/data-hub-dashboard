import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

const estado = vi.hoisted(() => ({ sesion: null as null | { id: string; banned: boolean } }))

vi.mock('@/lib/session', () => ({
  getSessionUser: async () => estado.sesion,
}))

usarDbTemporal('usuario-idioma')

const USER_ID = 'usuario-idioma-test'

function peticion(body: unknown): Request {
  return new Request('http://localhost/api/usuario/idioma', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function leerIdioma(): Promise<string | null | undefined> {
  const { getDb } = await import('@/lib/db')
  const { user } = await import('@/lib/db/schema')
  const [fila] = await getDb().select({ idioma: user.idioma }).from(user).where(eq(user.id, USER_ID))
  return fila?.idioma
}

describe('PATCH /api/usuario/idioma', () => {
  let PATCH: (request: Request) => Promise<Response>

  beforeAll(async () => {
    const { ensureSeeded } = await import('@/lib/db/seed')
    await ensureSeeded()
    ;({ PATCH } = await import('./route'))
  })

  beforeEach(async () => {
    const { getDb } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    const db = getDb()
    await db.delete(user).where(eq(user.id, USER_ID))
    await db.insert(user).values({
      id: USER_ID,
      name: 'Idioma',
      email: 'usuario-idioma-test@example.com',
      emailVerified: false,
      role: 'consulta',
    } as typeof user.$inferInsert)
    estado.sesion = { id: USER_ID, banned: false }
  })

  it('returns 401 without a session', async () => {
    estado.sesion = null
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for a banned session', async () => {
    estado.sesion = { id: USER_ID, banned: true }
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for a body that is not JSON', async () => {
    const res = await PATCH(peticion('{no-json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a value outside es|pt', async () => {
    const res = await PATCH(peticion({ idioma: 'en' }))
    expect(res.status).toBe(400)
    expect(await leerIdioma()).toBeNull()
  })

  it('returns 400 for a language the active region does not offer', async () => {
    const res = await PATCH(peticion({ idioma: 'pt' }))
    expect(res.status).toBe(400)
    expect(await leerIdioma()).toBeNull()
  })

  it('returns 200 and persists the preference for an offered language', async () => {
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ idioma: 'es' })
    expect(await leerIdioma()).toBe('es')
  })
})
