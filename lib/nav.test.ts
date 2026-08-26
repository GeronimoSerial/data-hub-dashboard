import { describe, expect, it } from 'vitest'
import { gatedStaticPath, isBleedViewerPath } from './nav'

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

  it('does not rewrite the /recursos/[id] viewer', () => {
    expect(gatedStaticPath('/recursos/r1')).toBeNull()
    expect(gatedStaticPath('/recursos/abc-def')).toBeNull()
  })

  it('strips query and hash before matching', () => {
    expect(gatedStaticPath('/tablero?key=1')).toBe('/tablero')
    expect(gatedStaticPath('/recursos/reporte-sobreedad-inicial.pdf#p=2')).toBe(
      '/recursos/reporte-sobreedad-inicial.pdf',
    )
  })

  it('ignores unrelated paths', () => {
    expect(gatedStaticPath('/mapas/matricula')).toBeNull()
    expect(gatedStaticPath('/api/gate/tablero')).toBeNull()
    expect(gatedStaticPath('/')).toBeNull()
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
    expect(isBleedViewerPath('/')).toBe(false)
    expect(isBleedViewerPath('/admin')).toBe(false)
  })
})
