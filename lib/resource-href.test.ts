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

  it('uses ruta when there is no storageKey', () => {
    expect(
      resourceCardTarget({ id: 'r1', ruta: '/mapas/matricula' }),
    ).toBe('/mapas/matricula')
  })

  it('returns null when there is neither file nor ruta', () => {
    expect(resourceCardTarget({ id: 'x' })).toBeNull()
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
  })
})
