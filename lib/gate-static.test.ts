import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  gateContentType,
  gateLookupRuta,
  publicAbsPath,
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
