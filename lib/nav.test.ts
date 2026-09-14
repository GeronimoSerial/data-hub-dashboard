import { describe, expect, it } from 'vitest'
import {
  gatedStaticPath,
  isBleedViewerPath,
  isMapViewerPath,
  isReadyHref,
  isStaticHref,
  normalizeForbiddenNext,
  normalizeLoginCallbackUrl,
} from './nav'

describe('gatedStaticPath', () => {
  it('returns prefix roots and nested paths', () => {
    expect(gatedStaticPath('/tablero')).toBe('/tablero')
    expect(gatedStaticPath('/tablero/')).toBe('/tablero/')
    expect(gatedStaticPath('/tablero/index.html')).toBe('/tablero/index.html')
    expect(gatedStaticPath('/mapa_interactivo/foo')).toBe(
      '/mapa_interactivo/foo',
    )
    expect(gatedStaticPath('/mapa_sobreedad')).toBe('/mapa_sobreedad')
    expect(gatedStaticPath('/mapa_notas')).toBe('/mapa_notas')
  })

  it('returns html and pdf under /recursos/', () => {
    expect(gatedStaticPath('/recursos/reporte-sobreedad-inicial.pdf')).toBe(
      '/recursos/reporte-sobreedad-inicial.pdf',
    )
    expect(gatedStaticPath('/recursos/nota.html')).toBe('/recursos/nota.html')
  })

  it('is case-insensitive on the file extension and keeps encoded names', () => {
    expect(gatedStaticPath('/recursos/reporte.PDF')).toBe(
      '/recursos/reporte.PDF',
    )
    expect(gatedStaticPath('/recursos/reporte%20sobreedad.pdf')).toBe(
      '/recursos/reporte%20sobreedad.pdf',
    )
    expect(gatedStaticPath('/recursos/nota.HTML')).toBe('/recursos/nota.HTML')
  })

  it('does not rewrite the /recursos/[id] viewer', () => {
    expect(gatedStaticPath('/recursos/r1')).toBeNull()
    expect(gatedStaticPath('/recursos/abc-def')).toBeNull()
  })

  it('strips query and hash before matching', () => {
    expect(gatedStaticPath('/tablero?key=1')).toBe('/tablero')
    expect(gatedStaticPath('/recursos/reporte-sobreedad-inicial.pdf#p=2')).toBe(
      '/recursos/reporte-sobreedad-inicial.pdf',
    )
    expect(gatedStaticPath('/mapa_interactivo/foo?capa=1&id=2')).toBe(
      '/mapa_interactivo/foo',
    )
  })

  it('treats trailing-slash files as non-gated', () => {
    expect(gatedStaticPath('/recursos/reporte.pdf/')).toBeNull()
  })

  it('ignores unrelated paths', () => {
    expect(gatedStaticPath('/mapas/matricula')).toBeNull()
    expect(gatedStaticPath('/api/gate/tablero')).toBeNull()
    expect(gatedStaticPath('/')).toBeNull()
    expect(gatedStaticPath('/recursos/')).toBeNull()
    expect(gatedStaticPath('/explorar?formato=mapa')).toBeNull()
  })
})

describe('isReadyHref', () => {
  it('accepts ready navigation roots', () => {
    for (const href of ['/', '/reportes', '/tableros', '/mapas']) {
      expect(isReadyHref(href)).toBe(true)
    }
  })

  it('rejects anything not in the ready list', () => {
    for (const href of [
      '/explorar',
      '/admin',
      '/login',
      '/forbidden',
      '/mapas/matricula',
      '/recursos/r1',
      '/tablero',
      '/tablero/',
      '/explorar?formato=mapa',
      '',
      '//evil.example',
    ]) {
      expect(isReadyHref(href)).toBe(false)
    }
  })
})

describe('isStaticHref', () => {
  it('accepts legacy static roots, nested html and pdf under /recursos/', () => {
    expect(isStaticHref('/tablero')).toBe(true)
    expect(isStaticHref('/tablero/')).toBe(true)
    expect(isStaticHref('/tablero/index.html')).toBe(true)
    expect(isStaticHref('/mapa_interactivo')).toBe(true)
    expect(isStaticHref('/mapa_sobreedad/')).toBe(true)
    expect(isStaticHref('/mapa_notas')).toBe(true)
    expect(isStaticHref('/recursos/reporte-sobreedad-inicial.pdf')).toBe(true)
    expect(isStaticHref('/recursos/nota.html')).toBe(true)
  })

  it('strips query and hash before matching', () => {
    expect(isStaticHref('/tablero?capa=1')).toBe(true)
    expect(isStaticHref('/recursos/reporte.pdf#p=3')).toBe(true)
  })

  it('rejects App Router routes and invalid hrefs', () => {
    expect(isStaticHref('/')).toBe(false)
    expect(isStaticHref('/explorar')).toBe(false)
    expect(isStaticHref('/mapas/matricula')).toBe(false)
    expect(isStaticHref('/recursos/r1')).toBe(false)
    expect(isStaticHref('/admin')).toBe(false)
    expect(isStaticHref('//evil.example')).toBe(false)
    expect(isStaticHref('')).toBe(false)
  })
})

describe('isMapViewerPath', () => {
  it('bleeds any route below /mapas/ but not the alias root', () => {
    expect(isMapViewerPath('/mapas/matricula')).toBe(true)
    expect(isMapViewerPath('/mapas/sobreedad')).toBe(true)
    expect(isMapViewerPath('/mapas/')).toBe(true)
    expect(isMapViewerPath('/mapas')).toBe(false)
    expect(isMapViewerPath('/explorar')).toBe(false)
    expect(isMapViewerPath('/recursos/r1')).toBe(false)
  })
})

describe('isBleedViewerPath', () => {
  it('bleeds native maps and uploaded HTML/PDF viewers so maps fill the shell', () => {
    expect(isBleedViewerPath('/mapas/matricula')).toBe(true)
    expect(isBleedViewerPath('/recursos/r1')).toBe(true)
    expect(isBleedViewerPath('/recursos/abc-def')).toBe(true)
  })

  it('keeps catalog and static files in the padded shell', () => {
    expect(isBleedViewerPath('/mapas')).toBe(false)
    expect(isBleedViewerPath('/recursos')).toBe(false)
    expect(isBleedViewerPath('/recursos/reporte-sobreedad-inicial.pdf')).toBe(
      false,
    )
    expect(isBleedViewerPath('/recursos/r1.pdf')).toBe(false)
    expect(isBleedViewerPath('/')).toBe(false)
    expect(isBleedViewerPath('/admin')).toBe(false)
  })
})

describe('normalizeLoginCallbackUrl', () => {
  it('keeps safe app-relative callbacks with query and hash', () => {
    expect(normalizeLoginCallbackUrl('/tablero')).toBe('/tablero')
    expect(normalizeLoginCallbackUrl('/recursos/r1?from=explorar#top')).toBe(
      '/recursos/r1?from=explorar#top',
    )
    expect(normalizeLoginCallbackUrl('/explorar?formato=mapa')).toBe(
      '/explorar?formato=mapa',
    )
  })

  it('falls back to home for empty, external and protocol-relative callbacks', () => {
    expect(normalizeLoginCallbackUrl(null)).toBe('/')
    expect(normalizeLoginCallbackUrl('')).toBe('/')
    expect(normalizeLoginCallbackUrl('https://evil.example')).toBe('/')
    expect(normalizeLoginCallbackUrl('//evil.example')).toBe('/')
    expect(normalizeLoginCallbackUrl('tablero')).toBe('/')
  })
})

describe('normalizeForbiddenNext', () => {
  it('keeps safe app-relative destinations', () => {
    expect(normalizeForbiddenNext('/recursos/abc')).toBe('/recursos/abc')
    expect(normalizeForbiddenNext('/admin')).toBe('/admin')
    expect(normalizeForbiddenNext('/recursos/r1?from=explorar')).toBe(
      '/recursos/r1?from=explorar',
    )
  })

  it('rejects missing, external and protocol-relative input', () => {
    expect(normalizeForbiddenNext(null)).toBeNull()
    expect(normalizeForbiddenNext(undefined)).toBeNull()
    expect(normalizeForbiddenNext('')).toBeNull()
    expect(normalizeForbiddenNext('https://evil.example')).toBeNull()
    expect(normalizeForbiddenNext('//evil.example')).toBeNull()
    expect(normalizeForbiddenNext('recursos/r1')).toBeNull()
  })
})