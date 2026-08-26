import { describe, expect, it } from 'vitest'
import {
  HTML_IFRAME_SANDBOX,
  archivoSrc,
  viewerKind,
} from './recurso-viewer'

describe('viewerKind', () => {
  it('maps html, images, pdf, and download mimes', () => {
    expect(viewerKind('text/html')).toBe('html')
    expect(viewerKind('image/png')).toBe('image')
    expect(viewerKind('image/jpeg')).toBe('image')
    expect(viewerKind('application/pdf')).toBe('pdf')
    expect(
      viewerKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('download')
    expect(
      viewerKind(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('download')
  })

  it('does not treat svg as an in-page image', () => {
    expect(viewerKind('image/svg+xml')).toBe('unknown')
  })
})

describe('HTML iframe sandbox', () => {
  it('allows scripts and forms without same-origin', () => {
    expect(HTML_IFRAME_SANDBOX).toBe('allow-scripts allow-forms')
    expect(HTML_IFRAME_SANDBOX).not.toContain('allow-same-origin')
  })
})

describe('archivoSrc', () => {
  it('points at the authenticated stream, with optional download', () => {
    expect(archivoSrc('r9')).toBe('/api/recursos/r9/archivo')
    expect(archivoSrc('r9', true)).toBe('/api/recursos/r9/archivo?download=1')
  })
})
