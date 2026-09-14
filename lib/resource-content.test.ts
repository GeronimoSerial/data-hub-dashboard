import { describe, expect, it } from 'vitest'
import { resourceContent } from './resource-content'

describe('resourceContent', () => {
  it('models the tablero seed copy as the single legacy pilot', () => {
    expect(resourceContent({ id: 'r2', storageKey: 'r2/seed', mime: 'text/html', ruta: undefined })).toEqual({
      kind: 'legacy-pilot',
      src: '/api/recursos/r2/archivo',
      fallbackHref: '/tablero',
    })
  })

  it('keeps uploaded files and React routes distinct', () => {
    expect(resourceContent({ id: 'upload', storageKey: 'upload/file', mime: 'application/pdf', ruta: undefined }).kind).toBe('stored')
    expect(resourceContent({ id: 'map', mime: undefined, ruta: '/mapas/matricula' }).kind).toBe('react-route')
    expect(resourceContent({ id: 'legacy', mime: undefined, ruta: '/mapa_interactivo' }).kind).toBe('legacy-route')
  })

  it('does not promote replaced or non-HTML r2 files to the pilot', () => {
    expect(resourceContent({ id: 'r2', storageKey: 'r2/uploaded', mime: 'text/html', ruta: undefined }).kind).toBe('stored')
    expect(resourceContent({ id: 'r2', storageKey: 'r2/seed', mime: 'application/pdf', ruta: undefined }).kind).toBe('stored')
    expect(resourceContent({ id: 'r2', storageKey: 'r2/seed', mime: undefined, ruta: undefined }).kind).toBe('stored')
  })

  it('never creates content for an invalid or empty route', () => {
    expect(resourceContent({ id: 'bad', mime: undefined, ruta: 'https://evil.example' })).toEqual({ kind: 'missing' })
    expect(resourceContent({ id: 'empty', mime: undefined, ruta: undefined })).toEqual({ kind: 'missing' })
  })
})
