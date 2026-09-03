import { describe, expect, it } from 'vitest'
import {
  normalizeResourceReturnTo,
  resourceCardHref,
  resourceCardTarget,
  resourceLegacyTarget,
} from './resource-href'

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

  it('uses the canonical ficha when there is only a valid legacy ruta', () => {
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/mapas/matricula' }),
    ).toBe('/recursos/r1')
  })

  it('accepts legacy routes with query, hash and trailing slash while keeping the ficha canonical', () => {
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/mapas/matricula?capa=1' }),
    ).toBe('/recursos/r1')
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/tablero/#top' }),
    ).toBe('/recursos/r1')
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/recursos/reporte.PDF' }),
    ).toBe('/recursos/r1')
  })

  it('trims storage keys before deciding whether a resource is valid', () => {
    expect(resourceCardTarget({ id: 'r1', storageKey: '   ', ruta: undefined })).toBeNull()
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

describe('resourceLegacyTarget', () => {
  it('returns only validated in-app legacy routes for the CTA', () => {
    expect(resourceLegacyTarget({ ruta: '/mapas/matricula?capa=1' })).toBe('/mapas/matricula?capa=1')
    expect(resourceLegacyTarget({ ruta: '//evil.example' })).toBeNull()
    expect(resourceLegacyTarget({ ruta: 'https://evil.example' })).toBeNull()
  })
})

describe('normalizeResourceReturnTo', () => {
  it('preserves an exact internal pathname, query and hash', () => {
    const origin = '/explorar?q=matrícula&tema=trayectorias#resultados'
    expect(normalizeResourceReturnTo(origin)).toBe(origin)
  })

  it('falls back for empty, external, protocol-relative and browser-ambiguous values', () => {
    for (const value of [undefined, null, '', 'https://evil.example', '//evil.example', '/\\\\evil.example']) {
      expect(normalizeResourceReturnTo(value)).toBe('/explorar')
    }
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

  it('carries Explore context only to the ficha and keeps the callback internal', () => {
    const returnTo = '/explorar?q=matrícula&tema=trayectorias&nivel=primario'
    expect(
      resourceCardHref('/recursos/r1', { isPending: false, hasUser: true }, returnTo),
    ).toBe(`/recursos/r1?returnTo=${encodeURIComponent(returnTo)}`)
    expect(
      resourceCardHref('/recursos/r1', { isPending: false, hasUser: false }, returnTo),
    ).toBe(`/login?callbackUrl=${encodeURIComponent(`/recursos/r1?returnTo=${encodeURIComponent(returnTo)}`)}`)
  })

  it('does not append an invalid returnTo', () => {
    expect(
      resourceCardHref('/recursos/r1', { isPending: false, hasUser: true }, 'https://evil.example'),
    ).toBe('/recursos/r1')
  })

  it('rejects an external card target', () => {
    expect(
      resourceCardHref('https://evil.example', { isPending: false, hasUser: true }),
    ).toBeNull()
    expect(
      resourceCardHref('//evil.example', { isPending: false, hasUser: false }),
    ).toBeNull()
  })

  it('returns null when there is no target', () => {
    expect(
      resourceCardHref(null, { isPending: false, hasUser: false }),
    ).toBeNull()
    expect(resourceCardHref(null, { isPending: true, hasUser: true })).toBeNull()
  })
})
