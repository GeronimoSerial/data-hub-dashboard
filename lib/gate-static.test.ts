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
    expect(gateLookupRuta('/mapa_interactivo/index.html')).toBe(
      '/mapa_interactivo',
    )
    expect(gateLookupRuta('/recursos/reporte-sobreedad-inicial.pdf')).toBe(
      '/recursos/reporte-sobreedad-inicial.pdf',
    )
  })

  it('only maps the root index.html, nested html stays as a full path', () => {
    expect(gateLookupRuta('/mapa_interactivo/sub/index.html')).toBe(
      '/mapa_interactivo/sub/index.html',
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

  it('rejects backslash traversal and null bytes', () => {
    expect(publicAbsPath('/tablero/..\\..\\etc\\passwd')).toBeNull()
    expect(publicAbsPath('/tablero\\..\\secret')).toBeNull()
    expect(publicAbsPath('/tablero/\0secret')).toBeNull()
  })

  it('does not decode percent-encoded dot segments (resolved inside public/)', () => {
    const abs = publicAbsPath('/tablero/%2e%2e/secret')
    expect(abs).not.toBeNull()
    expect(abs!).toContain('tablero')
  })
})

describe('gateContentType', () => {
  it('sets HTML charset utf-8 and PDF mime', () => {
    expect(gateContentType('/public/tablero/index.html')).toBe(
      'text/html; charset=utf-8',
    )
    expect(gateContentType('reporte.pdf')).toBe('application/pdf')
  })

  it('is case-insensitive and maps .htm to html', () => {
    expect(gateContentType('/x.HTML')).toBe('text/html; charset=utf-8')
    expect(gateContentType('/x.PDF')).toBe('application/pdf')
    expect(gateContentType('/x.htm')).toBe('text/html; charset=utf-8')
  })

  it('defaults unknown files to octet-stream', () => {
    expect(gateContentType('/x.json')).toBe('application/octet-stream')
    expect(gateContentType('/x')).toBe('application/octet-stream')
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

  it('preserves hash fragments and multi-value query strings', () => {
    expect(gateLoginCallbackUrl('/tablero', '?capa=1#sel=2')).toBe(
      '/tablero?capa=1#sel=2',
    )
    expect(gateLoginCallbackUrl('/recursos/r1', '?a=1&a=2&b=x')).toBe(
      '/recursos/r1?a=1&a=2&b=x',
    )
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
