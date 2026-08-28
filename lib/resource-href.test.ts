import { describe, expect, it } from 'vitest'
import { resourceCardHref, resourceCardTarget } from './resource-href'

describe('resourceCardTarget', () => {
  it('uses /recursos/:id when storageKey is set', () => {
    expect(
      resourceCardTarget({
        id: 'abc',
        storageKey: 'abc/file',
        ruta: '/ignored',
      }),
    ).toBe('/recursos/abc')
  })

  it('uses /recursos/:id and encodes special characters in the id', () => {
    expect(
      resourceCardTarget({ id: 'r 1', storageKey: 'r 1/file' }),
    ).toBe('/recursos/r%201')
    expect(
      resourceCardTarget({ id: 'ñandú', storageKey: 'x' }),
    ).toBe('/recursos/%C3%B1and%C3%BA')
  })

  it('uses ruta when there is no storageKey', () => {
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/mapas/matricula' }),
    ).toBe('/mapas/matricula')
  })

  it('keeps query, hash and trailing slash in allowed rutas', () => {
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/mapas/matricula?capa=1' }),
    ).toBe('/mapas/matricula?capa=1')
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/tablero/#top' }),
    ).toBe('/tablero/#top')
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/recursos/reporte.PDF' }),
    ).toBe('/recursos/reporte.PDF')
  })

  it('returns null when there is neither file nor ruta', () => {
    expect(resourceCardTarget({ id: 'x' })).toBeNull()
    expect(resourceCardTarget({ id: 'x', ruta: '   ' })).toBeNull()
  })

  it('does not use protocol-relative, off-app or invalid rutas as href', () => {
    expect(resourceCardTarget({ id: 'r1', ruta: '//evil.example' })).toBeNull()
    expect(
      resourceCardTarget({ id: 'r1', ruta: 'https://evil.example' }),
    ).toBeNull()
    expect(resourceCardTarget({ id: 'r1', ruta: '/admin' })).toBeNull()
    expect(resourceCardTarget({ id: 'r1', ruta: '/explorar' })).toBeNull()
    expect(resourceCardTarget({ id: 'r1', ruta: '/mapas' })).toBeNull()
  })
})

describe('resourceCardHref', () => {
  it('sends anonymous users to login with encoded callbackUrl', () => {
    expect(
      resourceCardHref('/recursos/abc', { isPending: false, hasUser: false }),
    ).toBe('/login?callbackUrl=%2Frecursos%2Fabc')
    expect(
      resourceCardHref('/tablero', { isPending: false, hasUser: false }),
    ).toBe('/login?callbackUrl=%2Ftablero')
  })

  it('encodes spaces and non-ASCII characters in the callbackUrl', () => {
    expect(
      resourceCardHref('/recursos/r 1', { isPending: false, hasUser: false }),
    ).toBe('/login?callbackUrl=%2Frecursos%2Fr%201')
    expect(
      resourceCardHref('/recursos/ñandú', { isPending: false, hasUser: false }),
    ).toBe('/login?callbackUrl=%2Frecursos%2F%C3%B1and%C3%BA')
  })

  it('preserves query and hash inside the encoded callbackUrl', () => {
    expect(
      resourceCardHref('/tablero?capa=1#top', {
        isPending: false,
        hasUser: false,
      }),
    ).toBe('/login?callbackUrl=%2Ftablero%3Fcapa%3D1%23top')
  })

  it('keeps the real target while session is pending', () => {
    expect(
      resourceCardHref('/recursos/abc', { isPending: true, hasUser: false }),
    ).toBe('/recursos/abc')
  })

  it('keeps the real target for logged-in users', () => {
    expect(
      resourceCardHref('/recursos/abc', { isPending: false, hasUser: true }),
    ).toBe('/recursos/abc')
  })

  it('returns null when there is no target', () => {
    expect(
      resourceCardHref(null, { isPending: false, hasUser: false }),
    ).toBeNull()
    expect(resourceCardHref(null, { isPending: true, hasUser: true })).toBeNull()
  })
})