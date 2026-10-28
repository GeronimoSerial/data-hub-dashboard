// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ArchivoMetadata } from './archivo-metadata'

afterEach(cleanup)
it('shows the uploaded name, upload date and protected download', () => {
  render(<ArchivoMetadata recurso={{ id: 'r1', storageKey: 'r1/uuid', mime: 'text/html', nombreOriginal: 'Informe original.html', cargadoEn: '2026-10-20T12:00:00Z' }} />)
  expect(screen.getByText('Informe original.html')).toBeTruthy()
  expect(screen.getByText(/20\/10\/2026/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Descargar archivo' }).getAttribute('href')).toBe('/api/recursos/r1/archivo?download=1')
})
it('shows explicit fallbacks for legacy files without usable metadata', () => {
  render(<ArchivoMetadata recurso={{ id: 'old', storageKey: 'old/uuid', mime: 'text/html' }} />)
  expect(screen.getByText('Fecha no registrada')).toBeTruthy()
  expect(screen.getByText('Nombre original no disponible')).toBeTruthy()
  expect(screen.getByRole('link')).toBeTruthy()
})
it('uses a legacy storage filename when available', () => {
  render(<ArchivoMetadata recurso={{ id: 'old', storageKey: 'old/informe.htm', mime: 'text/html' }} />)
  expect(screen.getByText('informe.htm')).toBeTruthy()
})
it('does not add a download for a resource without a file', () => {
  const { container } = render(<ArchivoMetadata recurso={{ id: 'route' }} />)
  expect(container.innerHTML).toBe('')
})
