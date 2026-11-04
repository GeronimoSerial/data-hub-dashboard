// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import MaterialesPage from './page'

afterEach(cleanup)

describe('materials landing', () => {
  it('links to the virtual classroom request form without treating it as a PDF', async () => {
    render(await MaterialesPage())
    const link = screen.getByRole('link', { name: /Solicitar aula virtual/ })
    expect(link).toHaveAttribute('href', 'https://forms.gle/vrFAisMjeMWEa9TKA')
    expect(link).not.toHaveAttribute('download')
  })

  it('keeps the manual download and offers each educational level', async () => {
    render(await MaterialesPage())
    expect(screen.getByRole('link', { name: /Descargar Manual Nº 1/ })).toHaveAttribute('href', '/api/materiales/manual-1/descargar')
    for (const level of ['nivel inicial', '1.er grado', '2.º grado', '3.er grado', '4.º grado', '5.º grado', '6.º grado']) {
      expect(screen.getByRole('link', { name: new RegExp(`Descargar Cuadernillo para estudiantes (?:de |del )${level.replaceAll('.', '\\.')}, PDF`) })).toHaveAttribute('download')
    }
    expect(screen.getAllByRole('link', { name: /^Descargar / })).toHaveLength(8)
    expect(screen.getByLabelText('Sistema ENOS · Manual para directivos y supervisores')).toHaveAttribute('src', '/api/materiales/video-manual-directivos/video')
  })
})
