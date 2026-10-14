import { describe, expect, it } from 'vitest'
import {
  decideScrollAction,
  gatedStaticPath,
  isBleedViewerPath,
  isRestoreSettled,
  legacyRecursoRedirect,
  scrollRestorationKey,
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

describe('scrollRestorationKey', () => {
  it('combines pathname and search into one stable key', () => {
    expect(scrollRestorationKey('/explorar', '?tema=x&nivel=y')).toBe(
      'app-scroll:/explorar?tema=x&nivel=y',
    )
    expect(scrollRestorationKey('/explorar', 'tema=x')).toBe(
      'app-scroll:/explorar?tema=x',
    )
  })

  it('omits the query separator when there is no search', () => {
    expect(scrollRestorationKey('/', '')).toBe('app-scroll:/')
  })

  it('treats different search params as different keys', () => {
    expect(scrollRestorationKey('/explorar', '?tema=a')).not.toBe(
      scrollRestorationKey('/explorar', '?tema=b'),
    )
  })
})

describe('decideScrollAction', () => {
  it('always resets on a forward navigation, ignoring a stale saved value', () => {
    expect(decideScrollAction(false, '383')).toEqual({ type: 'reset' })
    expect(decideScrollAction(false, null)).toEqual({ type: 'reset' })
  })

  it('restores a saved positive value on a popstate navigation', () => {
    expect(decideScrollAction(true, '516')).toEqual({ type: 'restore', target: 516 })
  })

  it('resets on popstate when there is nothing usable to restore', () => {
    expect(decideScrollAction(true, null)).toEqual({ type: 'reset' })
    expect(decideScrollAction(true, '0')).toEqual({ type: 'reset' })
    expect(decideScrollAction(true, '-5')).toEqual({ type: 'reset' })
    expect(decideScrollAction(true, 'not-a-number')).toEqual({ type: 'reset' })
  })
})

describe('isRestoreSettled', () => {
  it('is not settled while under target and within budget', () => {
    expect(isRestoreSettled(0, 500, 10, 1000)).toBe(false)
    expect(isRestoreSettled(498, 500, 10, 1000)).toBe(false)
  })

  it('settles once within one pixel of the target', () => {
    expect(isRestoreSettled(499, 500, 10, 1000)).toBe(true)
    expect(isRestoreSettled(500, 500, 10, 1000)).toBe(true)
  })

  it('settles once the time budget is exceeded, even short of the target', () => {
    expect(isRestoreSettled(0, 500, 1001, 1000)).toBe(true)
  })
})

describe('legacyRecursoRedirect', () => {
  it('sends legacy static dashboards to their migrated /recursos/[id] viewer', () => {
    expect(legacyRecursoRedirect('/tablero')).toBe('/recursos/r2')
    expect(legacyRecursoRedirect('/tablero/')).toBe('/recursos/r2')
    expect(legacyRecursoRedirect('/tablero/index.html')).toBe('/recursos/r2')
    expect(legacyRecursoRedirect('/mapa_interactivo')).toBe('/recursos/r3')
    expect(legacyRecursoRedirect('/mapa_sobreedad/')).toBe('/recursos/r13')
    expect(legacyRecursoRedirect('/mapa_notas/index.html')).toBe('/recursos/r14')
  })

  it('leaves nested assets and unrelated paths to the gate', () => {
    expect(legacyRecursoRedirect('/tablero/datos.json')).toBeNull()
    expect(legacyRecursoRedirect('/tableros')).toBeNull()
    expect(legacyRecursoRedirect('/recursos/r2')).toBeNull()
    expect(legacyRecursoRedirect('/')).toBeNull()
  })
})
