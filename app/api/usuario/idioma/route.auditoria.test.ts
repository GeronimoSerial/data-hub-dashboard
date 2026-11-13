import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, user } from '@/lib/db/schema'

const estado = vi.hoisted(() => ({ sesion: null as null | { id: string; banned: boolean } }))

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: async () => {
      observarUsuarioAuditoria(estado.sesion ? { id: estado.sesion.id, role: 'consulta' } : null)
      return estado.sesion
    },
  }
})

usarDbTemporal('usuario-idioma-auditoria-')

const USER_ID = 'usuario-idioma-auditoria'
const EMAIL = 'usuario-idioma-auditoria@example.com'

function peticion(body: unknown): Request {
  return new Request('http://localhost/api/usuario/idioma', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function leerIdioma(): Promise<string | null | undefined> {
  const [fila] = await getDb().select({ idioma: user.idioma }).from(user).where(eq(user.id, USER_ID))
  return fila?.idioma
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de preferencia de idioma', () => {
  let PATCH: (request: Request) => Promise<Response>

  beforeAll(async () => {
    ;({ PATCH } = await import('./route'))
  })

  beforeEach(async () => {
    const db = getDb()
    await db.delete(user).where(eq(user.id, USER_ID))
    await db.insert(user).values({
      id: USER_ID,
      name: 'Idioma auditoría',
      email: EMAIL,
      emailVerified: false,
      role: 'consulta',
    } as typeof user.$inferInsert)
    estado.sesion = { id: USER_ID, banned: false }
  })

  it('guardar el idioma deja un evento usuario.idioma del propio usuario', async () => {
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'usuario.idioma',
      metodo: 'PATCH',
      rutaPlantilla: '/api/usuario/idioma',
      actorTipo: 'usuario',
      actorId: USER_ID,
      viaAcceso: 'sesion',
      objetoTipo: 'usuario',
      objetoId: USER_ID,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { campos: ['idioma'] },
    })
    expect(await leerIdioma()).toBe('es')
  })

  it('el evento no guarda el valor del idioma ni el correo del usuario', async () => {
    const res = await PATCH(peticion({ idioma: 'es' }))
    const serializado = JSON.stringify(await eventoDe(res))
    expect(serializado).not.toContain(EMAIL)
    expect(serializado).not.toContain('"idioma":"es"')
  })

  it('un idioma inválido deja un evento invalido y no cambia la preferencia', async () => {
    const res = await PATCH(peticion({ idioma: 'en' }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ actorId: USER_ID, resultado: 'invalido', httpStatus: 400 })
    expect(await leerIdioma()).toBeNull()
  })

  it('sin sesión deja un evento rechazado de actor anónimo', async () => {
    estado.sesion = null
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({
      actorTipo: 'anonimo',
      actorId: null,
      resultado: 'rechazado',
      httpStatus: 401,
    })
  })

  it('una cuenta suspendida deja un evento rechazado y no cambia la preferencia', async () => {
    estado.sesion = { id: USER_ID, banned: true }
    const res = await PATCH(peticion({ idioma: 'es' }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: USER_ID, resultado: 'rechazado', httpStatus: 403 })
    expect(await leerIdioma()).toBeNull()
  })

  it('si la auditoría no puede guardarse responde 503 y el idioma no cambia', async () => {
    const res = await conFalloAuditoria(() => PATCH(peticion({ idioma: 'es' })))
    expect(res.status).toBe(503)
    expect(((await res.json()) as { code: string }).code).toBe('auditoria_no_disponible')
    expect(await leerIdioma()).toBeNull()
  })
})
