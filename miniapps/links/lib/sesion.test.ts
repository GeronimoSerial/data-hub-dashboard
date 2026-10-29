import { describe, expect, it } from 'vitest'
import { COOKIE_PATH, DURACION_S, credencialesValidas, crearToken, leerCredenciales, origenPropio, tokenValido } from './sesion'

const SECRETO = 'x'.repeat(40)
const cred = { usuario: 'editor', clave: 'clave-larga-123', secreto: SECRETO }
const env = (extra: Record<string, string | undefined> = {}) =>
  ({ LINKS_ADMIN_USER: 'editor', LINKS_ADMIN_PASSWORD: 'clave-larga-123', LINKS_SESSION_SECRET: SECRETO, ...extra })

describe('leerCredenciales', () => {
  it('devuelve las credenciales cuando están completas', () => {
    expect(leerCredenciales(env())).toEqual(cred)
  })

  it.each(['LINKS_ADMIN_USER', 'LINKS_ADMIN_PASSWORD', 'LINKS_SESSION_SECRET'])('queda cerrada si falta %s', (clave) => {
    expect(leerCredenciales(env({ [clave]: undefined }))).toBeNull()
  })

  it('queda cerrada con un secreto de menos de 32 caracteres', () => {
    expect(leerCredenciales(env({ LINKS_SESSION_SECRET: 'corto' }))).toBeNull()
  })
})

describe('credencialesValidas', () => {
  it('acepta solo el par exacto', () => {
    expect(credencialesValidas(cred, 'editor', 'clave-larga-123')).toBe(true)
    expect(credencialesValidas(cred, 'editor', 'otra')).toBe(false)
    expect(credencialesValidas(cred, 'otro', 'clave-larga-123')).toBe(false)
    expect(credencialesValidas(cred, '', '')).toBe(false)
  })
})

describe('token de sesión', () => {
  const ahora = 1_700_000_000_000

  it('es válido dentro de su duración y vence después', () => {
    const token = crearToken(SECRETO, ahora)
    expect(tokenValido(SECRETO, token, ahora + 1000)).toBe(true)
    expect(tokenValido(SECRETO, token, ahora + (DURACION_S + 1) * 1000)).toBe(false)
  })

  it('rechaza uno firmado con otro secreto, alterado o malformado', () => {
    const token = crearToken(SECRETO, ahora)
    expect(tokenValido('y'.repeat(40), token, ahora)).toBe(false)
    const [expira, firma] = token.split('.')
    expect(tokenValido(SECRETO, `${Number(expira) + 999999}.${firma}`, ahora)).toBe(false)
    for (const malo of [undefined, '', 'abc', '1.2.3', '.firma', `${expira}.`]) expect(tokenValido(SECRETO, malo, ahora)).toBe(false)
  })

  it('acota la cookie al camino de la miniapp', () => {
    expect(COOKIE_PATH).toBe('/links')
  })
})

describe('origenPropio', () => {
  const pedido = (headers: Record<string, string>) => new Request('http://interno:3000/links/api/sesion', { method: 'POST', headers })

  it('acepta un Origin cuyo host coincide con el del pedido', () => {
    expect(origenPropio(pedido({ origin: 'https://a.mec.gob.ar', host: 'a.mec.gob.ar' }))).toBe(true)
    expect(origenPropio(pedido({ origin: 'https://a.mec.gob.ar', host: 'interno:3000', 'x-forwarded-host': 'a.mec.gob.ar' }))).toBe(true)
  })

  it('rechaza otro origen, la ausencia de Origin o un valor inválido', () => {
    expect(origenPropio(pedido({ origin: 'https://evil.com', host: 'a.mec.gob.ar' }))).toBe(false)
    expect(origenPropio(pedido({ host: 'a.mec.gob.ar' }))).toBe(false)
    expect(origenPropio(pedido({ origin: 'no-es-url', host: 'a.mec.gob.ar' }))).toBe(false)
  })
})
