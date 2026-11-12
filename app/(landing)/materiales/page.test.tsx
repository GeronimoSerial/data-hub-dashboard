// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import styles from './page.module.css'
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

  it('links to Educaplay in virtual classrooms', async () => {
    render(await MaterialesPage())
    expect(screen.getByRole('link', { name: /Acceder a Educaplay/ })).toHaveAttribute('href', 'https://corrientesplay.ar/educaplay/')
    expect(screen.getByRole('link', { name: /Descargar Cuadernillo Nivel Superior/ })).toHaveAttribute('href', '/api/materiales/cuadernillo-nivel-superior/descargar')
  })

  it('separates classroom actions with a wrapping layout and a 16px gap', async () => {
    render(await MaterialesPage())
    const request = screen.getByRole('link', { name: /Solicitar aula virtual/ })
    const educaplay = screen.getByRole('link', { name: /Acceder a Educaplay/ })
    expect(request.parentElement).toBe(educaplay.parentElement)
    expect(request.parentElement).toHaveClass(styles.classroomActions)
    const css = readFileSync(`${process.cwd()}/app/(landing)/materiales/page.module.css`, 'utf8')
    const actions = css.match(/\.classroomActions\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(actions).toMatch(/display:\s*flex;/)
    expect(actions).toMatch(/flex-wrap:\s*wrap;/)
    expect(actions).toMatch(/gap:\s*16px;/)
  })

  it('keeps the manual download and offers each educational level', async () => {
    render(await MaterialesPage())
    expect(screen.getByRole('link', { name: /Descargar Manual Nº 1/ })).toHaveAttribute('href', '/api/materiales/manual-1/descargar')
    for (const level of ['nivel inicial', '1.er grado', '2.º grado', '3.er grado', '4.º grado', '5.º grado', '6.º grado']) {
      expect(screen.getByRole('link', { name: new RegExp(`Descargar Cuadernillo para estudiantes (?:de |del )${level.replaceAll('.', '\\.')}, PDF`) })).toHaveAttribute('download')
    }
    expect(screen.getAllByRole('link', { name: /^Descargar / })).toHaveLength(9)
    expect(screen.getByLabelText('Sistema ENOS · Manual para directivos y supervisores')).toHaveAttribute('src', '/api/materiales/video-manual-directivos/video')
  })
})
