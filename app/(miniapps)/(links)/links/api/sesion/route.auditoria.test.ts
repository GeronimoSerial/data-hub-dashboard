import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { _reiniciarLimitadoresParaTests } from '@/lib/http/limitador'
import { migrarDb, getDb } from '@/lib/db'
import { auditoriaEvento, linksSesiones } from '@/lib/db/schema'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { leerCredenciales, usuarioSesion } from '@/miniapps/links/lib/sesion'
import { DELETE, POST } from './route'

const SECRETO = 'x'.repeat(40)
const CLAVE = 'clave-larga-123'

beforeAll(() => migrarDb())

beforeEach(() => {
  vi.stubEnv('LINKS_ADMIN_USERS', 'editor:clave-larga-123,otro:otra-clave')
  vi.stubEnv('LINKS_SESSION_SECRET', SECRETO)
  _reiniciarLimitadoresParaTests()
})
afterEach(() => vi.unstubAllEnvs())

const ORIGEN = { origin: 'https://a.mec.gob.ar', host: 'a.mec.gob.ar' }

const pedido = (body: unknown, headers: Record<string, string> = ORIGEN) =>
  new Request('https://a.mec.gob.ar/links/api/sesion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function sesionesDe(usuario: string) {
  return getDb().select().from(linksSesiones).where(eq(linksSesiones.usuario, usuario))
}

describe('auditoría del inicio de sesión de links', () => {
  it('iniciar sesión deja un evento links.sesion_iniciar con el usuario configurado', async () => {
    const antes = (await sesionesDe('editor')).length
    const res = await POST(pedido({ usuario: 'editor', clave: CLAVE }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^links_admin=[A-Za-z0-9_-]{43};/)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'links.sesion_iniciar',
      metodo: 'POST',
      rutaPlantilla: '/links/api/sesion',
      actorTipo: 'compartido',
      actorId: 'editor',
      viaAcceso: 'sesion_links',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect((await sesionesDe('editor')).length).toBe(antes + 1)
  })

  it('el evento no guarda la clave ni el token de sesión', async () => {
    const res = await POST(pedido({ usuario: 'editor', clave: CLAVE }))
    const token = res.headers.get('set-cookie')!.split(';')[0].split('=')[1]
    const serializado = JSON.stringify(await eventoDe(res))
    expect(serializado).not.toContain(CLAVE)
    expect(serializado).not.toContain(token)
  })

  it('credenciales incorrectas dejan un evento rechazado sin guardar el usuario ni la clave intentados', async () => {
    const usuario = `intento-${randomUUID()}`
    const clave = `clave-${randomUUID()}`
    const res = await POST(pedido({ usuario, clave }))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'links.sesion_iniciar',
      actorTipo: 'anonimo',
      actorId: null,
      resultado: 'rechazado',
      httpStatus: 401,
    })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(usuario)
    expect(serializado).not.toContain(clave)
  })

  it('otro origen deja un evento rechazado y no abre sesión', async () => {
    const antes = (await sesionesDe('editor')).length
    const res = await POST(pedido({ usuario: 'editor', clave: CLAVE }, { origin: 'https://evil.com', host: 'a.mec.gob.ar' }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
    expect((await sesionesDe('editor')).length).toBe(antes)
  })

  it('el límite de intentos deja un evento rechazado con 429', async () => {
    let res: Response | undefined
    for (let i = 0; i < 12 && res?.status !== 429; i++) res = await POST(pedido({ usuario: 'editor', clave: 'mala' }))
    expect(res!.status).toBe(429)
    expect(await eventoDe(res!)).toMatchObject({ resultado: 'rechazado', httpStatus: 429 })
  })

  it('si la auditoría no puede guardarse responde 503, no emite cookie y no abre sesión', async () => {
    const antes = (await sesionesDe('editor')).length
    const res = await conFalloAuditoria(() => POST(pedido({ usuario: 'editor', clave: CLAVE })))
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(((await res.json()) as { code: string }).code).toBe('auditoria_no_disponible')
    expect((await sesionesDe('editor')).length).toBe(antes)
  })
})

describe('auditoría del cierre de sesión de links', () => {
  it('cerrar sesión deja un evento links.sesion_cerrar y revoca el token', async () => {
    const login = await POST(pedido({ usuario: 'otro', clave: 'otra-clave' }))
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const token = cookie.split('=')[1]
    const cred = leerCredenciales()!
    expect(await usuarioSesion(cred, token)).toBe('otro')

    const res = await DELETE(new Request('https://a.mec.gob.ar/links/api/sesion', {
      method: 'DELETE',
      headers: { ...ORIGEN, cookie },
    }))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'links.sesion_cerrar',
      metodo: 'DELETE',
      actorTipo: 'compartido',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await usuarioSesion(cred, token)).toBeNull()
  })

  it('si la auditoría no puede guardarse el cierre responde 503 y la sesión sigue activa', async () => {
    const login = await POST(pedido({ usuario: 'otro', clave: 'otra-clave' }))
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const token = cookie.split('=')[1]

    const res = await conFalloAuditoria(() => DELETE(new Request('https://a.mec.gob.ar/links/api/sesion', {
      method: 'DELETE',
      headers: { ...ORIGEN, cookie },
    })))
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await usuarioSesion(leerCredenciales()!, token)).toBe('otro')
    const [fila] = await getDb().select().from(linksSesiones).where(and(eq(linksSesiones.usuario, 'otro')))
    expect(fila).toBeDefined()
  })
})
