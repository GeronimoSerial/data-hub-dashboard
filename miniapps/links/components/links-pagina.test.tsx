// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CONFIG_INICIAL, type LinksConfig } from '@/miniapps/links/lib/config'
import { LinksPagina } from './links-pagina'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const config: LinksConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Accesos externos',
  subtitulo: 'Portales de otros organismos',
  enlaces: [
    { id: 'e1', titulo: 'Portal del Estado', descripcion: 'Trámites nacionales', url: 'https://www.argentina.gob.ar/tramites' },
    { id: 'e2', titulo: 'Sin descripción', descripcion: '', url: 'https://ejemplo.org' },
  ],
}

describe('LinksPagina', () => {
  it('muestra un único h1 con el título y la descripción', () => {
    render(<LinksPagina config={config} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Accesos externos')
    expect(screen.getByText('Portales de otros organismos')).toBeTruthy()
  })

  it('lista título, descripción y dominio de cada enlace', () => {
    render(<LinksPagina config={config} />)
    const portal = screen.getByRole('link', { name: /Portal del Estado/ })
    expect(portal.getAttribute('href')).toBe('https://www.argentina.gob.ar/tramites')
    expect(within(portal).getByText('Trámites nacionales')).toBeTruthy()
    expect(within(portal).getByText('www.argentina.gob.ar')).toBeTruthy()
    expect(within(screen.getByRole('link', { name: /Sin descripción/ })).queryByText('Trámites nacionales')).toBeNull()
  })

  it('abre todos los enlaces en pestaña nueva con rel seguro y lo avisa a lectores de pantalla', () => {
    render(<LinksPagina config={config} />)
    for (const link of within(screen.getByRole('list')).getAllByRole('link')) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      expect(link.textContent).toContain('se abre en una pestaña nueva')
    }
  })

  it('no menciona el Hub ni ofrece rutas internas', () => {
    render(<LinksPagina config={config} />)
    for (const link of within(screen.getByRole('main')).getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https?:\/\//)
    }
  })

  it('deja un acceso discreto "Admin" al pie, también sin enlaces', () => {
    const { rerender } = render(<LinksPagina config={config} />)
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/links/admin')
    rerender(<LinksPagina config={{ ...config, enlaces: [] }} />)
    expect(screen.getByRole('link', { name: 'Admin' })).toBeTruthy()
  })

  it('explica por qué está vacía cuando no hay enlaces', () => {
    render(<LinksPagina config={{ ...config, enlaces: [] }} />)
    expect(within(screen.getByRole('status')).getByText(/Todavía no hay accesos publicados/)).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('ofrece cambiar de tema con un nombre accesible', () => {
    render(<LinksPagina config={config} />)
    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toBeTruthy()
  })
})

describe('LinksPagina: Centro Administrativo', () => {
  it('muestra el área y su Instagram en el pie, no en el encabezado', () => {
    render(<LinksPagina config={config} />)
    const pie = screen.getByRole('contentinfo')
    expect(within(pie).getByText('Centro Administrativo')).toBeTruthy()
    expect(within(screen.getByRole('banner')).queryByText('Centro Administrativo')).toBeNull()
    const ig = within(pie).getByRole('link', { name: /Instagram de Centro Administrativo/ })
    expect(ig.getAttribute('href')).toBe('https://www.instagram.com/centroadministrativomec')
    expect(ig.getAttribute('target')).toBe('_blank')
    expect(ig.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
