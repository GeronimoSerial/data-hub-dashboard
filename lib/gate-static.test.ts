import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  gateContentType,
  gateLoginCallbackUrl,
  gateLookupRuta,
  publicAbsPath,
  publicOrigin,
} from './gate-static'

describe('gateLookupRuta', () => {
  it('strips trailing slashes and maps prefix index.html to the seed ruta', () => {
    expect(gateLookupRuta('/tablero')).toBe('/tablero')
    expect(gateLookupRuta('/tablero/')).toBe('/tablero')
    expect(gateLookupRuta('/tablero/index.html')).toBe('/tablero')
    expect(gateLookupRuta('/recursos/reporte-sobreedad-inicial.pdf')).toBe(
      '/recursos/reporte-sobreedad-inicial.pdf',
    )
  })
})

describe('publicAbsPath', () => {
  it('resolves under public/ and rejects traversal', () => {
    const root = path.resolve(process.cwd(), 'public')
    expect(publicAbsPath('/tablero')).toBe(path.join(root, 'tablero'))
    expect(publicAbsPath('/recursos/reporte-sobreedad-inicial.pdf')).toBe(
      path.join(root, 'recursos/reporte-sobreedad-inicial.pdf'),
    )
    expect(publicAbsPath('/tablero/../.env')).toBeNull()
    expect(publicAbsPath('/tablero/../../etc/passwd')).toBeNull()
  })
})

describe('gateContentType', () => {
  it('sets HTML charset utf-8 and PDF mime', () => {
    expect(gateContentType('/public/tablero/index.html')).toBe(
      'text/html; charset=utf-8',
    )
    expect(gateContentType('reporte.pdf')).toBe('application/pdf')
  })
})

describe('gateLoginCallbackUrl', () => {
  it('keeps the request search so tablero deep-links survive login', () => {
    expect(gateLoginCallbackUrl('/tablero', '?key=foo')).toBe(
      '/tablero?key=foo',
    )
    expect(gateLoginCallbackUrl('/mapa_interactivo', '?capa=1&id=2')).toBe(
      '/mapa_interactivo?capa=1&id=2',
    )
  })

  it('stays a path-only callback when there is no query', () => {
    expect(gateLoginCallbackUrl('/tablero', '')).toBe('/tablero')
    expect(gateLoginCallbackUrl('/tablero', '?')).toBe('/tablero')
  })
})

describe('publicOrigin', () => {
  const bindRequest = new Request('http://0.0.0.0:3000/tablero')

  it('prefers BETTER_AUTH_URL over the container bind address', () => {
    const prev = process.env.BETTER_AUTH_URL
    process.env.BETTER_AUTH_URL = 'https://analisis.sistemas.mec.gob.ar'
    try {
      expect(publicOrigin(bindRequest)).toBe(
        'https://analisis.sistemas.mec.gob.ar',
      )
    } finally {
      if (prev === undefined) delete process.env.BETTER_AUTH_URL
      else process.env.BETTER_AUTH_URL = prev
    }
  })

  it('uses x-forwarded-host when BETTER_AUTH_URL is unset', () => {
    const prev = process.env.BETTER_AUTH_URL
    delete process.env.BETTER_AUTH_URL
    try {
      const request = new Request('http://0.0.0.0:3000/tablero', {
        headers: {
          'x-forwarded-host': 'data-hub-preview.sistemas.mec.gob.ar',
          'x-forwarded-proto': 'https',
        },
      })
      expect(publicOrigin(request)).toBe(
        'https://data-hub-preview.sistemas.mec.gob.ar',
      )
    } finally {
      if (prev === undefined) delete process.env.BETTER_AUTH_URL
      else process.env.BETTER_AUTH_URL = prev
    }
  })
})
