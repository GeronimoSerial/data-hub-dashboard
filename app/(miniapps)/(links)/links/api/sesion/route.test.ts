import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, POST } from './route'

const SECRETO = 'x'.repeat(40)

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
    expect(cookie).toMatch(/^links_admin=\d+\./)
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
