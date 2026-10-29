import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrarDb } from '@/lib/db'
import { leerCredenciales, usuarioSesion } from '@/miniapps/links/lib/sesion'
import { DELETE, POST } from './route'

const SECRETO = 'x'.repeat(40)

beforeAll(() => migrarDb())

beforeEach(() => {
  vi.stubEnv('LINKS_ADMIN_USERS', 'editor:clave-larga-123,otro:otra-clave')
  vi.stubEnv('LINKS_SESSION_SECRET', SECRETO)
})
afterEach(() => vi.unstubAllEnvs())

const pedido = (body: unknown, headers: Record<string, string> = { origin: 'https://a.mec.gob.ar', host: 'a.mec.gob.ar' }, metodo = 'POST') =>
  new Request('https://a.mec.gob.ar/links/api/sesion', {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
    body: JSON.stringify(body),
  })

describe('POST /links/api/sesion', () => {
  it('con credenciales correctas abre sesión con una cookie HttpOnly, Strict y acotada a /links', async () => {
    const res = await POST(pedido({ usuario: 'editor', clave: 'clave-larga-123' }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^links_admin=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/links')
  })

  it('acepta a cualquiera de los usuarios configurados', async () => {
    const res = await POST(pedido({ usuario: 'otro', clave: 'otra-clave' }))
    expect(res.status).toBe(200)
  })

  it('rechaza credenciales incorrectas sin emitir cookie', async () => {
    const res = await POST(pedido({ usuario: 'editor', clave: 'mala' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('queda cerrada (503) cuando el servidor no tiene credenciales configuradas', async () => {
    vi.stubEnv('LINKS_ADMIN_USERS', '')
    const res = await POST(pedido({ usuario: 'editor', clave: '' }))
    expect(res.status).toBe(503)
  })

  it('rechaza un pedido de otro origen', async () => {
    const res = await POST(pedido({ usuario: 'editor', clave: 'clave-larga-123' }, { origin: 'https://evil.com', host: 'a.mec.gob.ar' }))
    expect(res.status).toBe(403)
  })

  it('limita los intentos repetidos desde una misma IP', async () => {
    const headers = { origin: 'https://a.mec.gob.ar', host: 'a.mec.gob.ar', 'x-forwarded-for': '203.0.113.9' }
    const estados: number[] = []
    for (let i = 0; i < 12; i++) estados.push((await POST(pedido({ usuario: 'editor', clave: 'mala' }, headers))).status)
    expect(estados).toContain(429)
  })
})

describe('DELETE /links/api/sesion', () => {
  it('vence la cookie', async () => {
    const res = await DELETE(pedido({}, undefined, 'DELETE'))
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})


describe('cookie CADM y límites', () => {
  const cadm = (method = 'POST', cookie?: string) => new Request('http://links.sistemas.mec.gob.ar/cadm/api/sesion', {
    method, headers: { host: 'links.sistemas.mec.gob.ar', origin: process.env.NODE_ENV === 'production' ? 'https://links.sistemas.mec.gob.ar' : 'http://links.sistemas.mec.gob.ar', ...(cookie ? { cookie } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ usuario: 'editor', clave: 'clave-larga-123' }) } : {}),
  })
  it('usa Path CADM y Secure en producción aun con HTTP directo', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await POST(cadm())
    expect(res.headers.get('set-cookie')).toContain('Path=/cadm;')
    expect(res.headers.get('set-cookie')).toContain('; Secure')
  })
  it('logout revoca token y borra con el mismo path', async () => {
    const res = await POST(cadm())
    const cookie = res.headers.get('set-cookie')!.split(';')[0]
    const token = cookie.split('=')[1]
    expect(await usuarioSesion(leerCredenciales()!, token)).toBe('editor')
    const salida = await DELETE(cadm('DELETE', cookie))
    expect(salida.headers.get('set-cookie')).toContain('Path=/cadm; Max-Age=0')
    expect(await usuarioSesion(leerCredenciales()!, token)).toBeNull()
  })
  it('limita el body sin Content-Length', async () => {
    const req = pedido({ usuario: 'x'.repeat(5000), clave: 'x' })
    expect((await POST(req)).status).toBe(413)
  })
  it('429 lleva no-store aunque se altere forwarded-for sin peer confiable', async () => {
    let res: Response | undefined
    for (let i = 0; i < 11; i++) res = await POST(pedido({ usuario: 'editor', clave: 'mala' }))
    expect(res!.status).toBe(429)
    expect(res!.headers.get('cache-control')).toContain('no-store')
  })
})


it('Secure en desarrollo sólo usa protocolo reenviado con peer confiable', async () => {
  vi.stubEnv('LINKS_TRUSTED_PROXIES', '10.0.0.0/8')
  const req = (peer?: string) => {
    const r = new Request('http://a.mec.gob.ar/links/api/sesion', {
      method: 'POST', headers: { host: 'a.mec.gob.ar', origin: peer ? 'https://a.mec.gob.ar' : 'http://a.mec.gob.ar', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ usuario: 'editor', clave: 'clave-larga-123' }),
    })
    if (peer) Object.defineProperty(r, 'socket', { value: { remoteAddress: peer } })
    return r
  }
  const directo = await POST(req())
  expect(directo.status).toBe(200)
  expect(directo.headers.get('set-cookie')).not.toContain('; Secure')
  const proxy = await POST(req('10.0.0.1'))
  expect(proxy.status).toBe(200)
  expect(proxy.headers.get('set-cookie')).toContain('; Secure')
})
