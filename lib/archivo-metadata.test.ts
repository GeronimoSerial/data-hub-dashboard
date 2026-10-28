import { expect, it } from 'vitest'
import { fechaArchivo, nombreArchivo } from './archivo-metadata'
import { archivoResponseHeaders } from './archivo'

it('does not infer upload date from editorial dates or invalid dates', () => {
  expect(fechaArchivo()).toBe('Fecha no registrada')
  expect(fechaArchivo('invalid')).toBe('Fecha no registrada')
})
it('prefers original metadata over storage and ignores opaque keys', () => {
  expect(nombreArchivo({ nombreOriginal: 'real.html', storageKey: 'r/other.html' })).toBe('real.html')
  expect(nombreArchivo({ storageKey: 'r/a-uuid' })).toBeNull()
})
it('sanitizes paths, control characters, quotes and unicode in attachment headers', () => {
  const h = archivoResponseHeaders({ mime: 'text/html', download: true, nombreOriginal: '../á"\r\n.html' })
  expect(h['Content-Disposition']).toBe("attachment; filename=\"____.html\"; filename*=UTF-8''%C3%A1___.html")
  expect(() => new Headers(h)).not.toThrow()
})
