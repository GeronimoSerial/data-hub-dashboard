import { beforeAll, describe, expect, it } from 'vitest'
import { migrarDb } from '@/lib/db'
import { DURACION_S, credencialesValidas, crearSesion, leerCredenciales, revocarSesion, usuarioSesion } from './sesion'

const SECRETO = 'x'.repeat(40)
const USUARIOS = 'editor:clave-larga-123,otra:segunda:con-dos-puntos'
const cred = {
  usuarios: [
    { usuario: 'editor', clave: 'clave-larga-123' },
    { usuario: 'otra', clave: 'segunda:con-dos-puntos' },
  ],
  secreto: SECRETO,
}
const env = (extra: Record<string, string | undefined> = {}) =>
  ({ LINKS_ADMIN_USERS: USUARIOS, LINKS_SESSION_SECRET: SECRETO, ...extra })

describe('leerCredenciales', () => {
  it('lee varios usuarios y deja pasar ":" dentro de la contraseña', () => {
    expect(leerCredenciales(env())).toEqual(cred)
  })

  it.each(['LINKS_ADMIN_USERS', 'LINKS_SESSION_SECRET'])('queda cerrada si falta %s', (clave) => {
    expect(leerCredenciales(env({ [clave]: undefined }))).toBeNull()
  })

  it.each(['', 'sin-separador', ':sinusuario', 'usuario:', 'ok:clave,roto'])('queda cerrada con la lista mal formada %j', (valor) => {
    expect(leerCredenciales(env({ LINKS_ADMIN_USERS: valor }))).toBeNull()
  })

  it('queda cerrada con un secreto de menos de 32 caracteres', () => {
    expect(leerCredenciales(env({ LINKS_SESSION_SECRET: 'corto' }))).toBeNull()
  })
})

describe('credencialesValidas', () => {
  it('acepta el par exacto de cualquiera de los usuarios', () => {
    expect(credencialesValidas(cred, 'editor', 'clave-larga-123')).toBe(true)
    expect(credencialesValidas(cred, 'otra', 'segunda:con-dos-puntos')).toBe(true)
    expect(credencialesValidas(cred, 'otra', 'clave-larga-123')).toBe(false)
    expect(credencialesValidas(cred, 'editor', 'otra')).toBe(false)
    expect(credencialesValidas(cred, 'otro', 'clave-larga-123')).toBe(false)
    expect(credencialesValidas(cred, '', '')).toBe(false)
  })
})


beforeAll(() => migrarDb())
describe('sesiones revocables', () => {
  it('identifica usuario y crea sesiones diferentes', async () => {
    const uno = await crearSesion(cred, 'editor')
    const dos = await crearSesion(cred, 'editor')
    expect(uno).not.toBe(dos)
    expect(await usuarioSesion(cred, uno)).toBe('editor')
  })
  it('revoca del lado servidor', async () => {
    const token = await crearSesion(cred, 'editor')
    await revocarSesion(token)
    expect(await usuarioSesion(cred, token)).toBeNull()
  })
  it('rechaza usuario eliminado, clave cambiada y secreto cambiado', async () => {
    const token = await crearSesion(cred, 'editor')
    expect(await usuarioSesion({ ...cred, usuarios: [cred.usuarios[1]] }, token)).toBeNull()
    expect(await usuarioSesion({ ...cred, usuarios: [{ usuario: 'editor', clave: 'nueva' }] }, token)).toBeNull()
    expect(await usuarioSesion({ ...cred, secreto: 'otro'.repeat(10) }, token)).toBeNull()
  })
  it('vence y rechaza tokens malformados', async () => {
    const ahora = Date.now()
    const token = await crearSesion(cred, 'editor', ahora)
    expect(await usuarioSesion(cred, token, ahora + DURACION_S * 1000)).toBeNull()
    expect(await usuarioSesion(cred, 'malo')).toBeNull()
    expect(await usuarioSesion(cred, undefined)).toBeNull()
  })
})
