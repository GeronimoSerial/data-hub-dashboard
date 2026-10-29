// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CONFIG_INICIAL, type LinktreeConfig } from '@/lib/linktree/config'
import { LinktreePagina } from './linktree-pagina'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const config: LinktreeConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Sistemas de Corrientes',
  subtitulo: 'Accesos del Ministerio',
  pie: 'Soporte: sistemas@ejemplo.gob.ar',
  grupos: [
    {
      id: 'g1',
      titulo: 'Datos',
      enlaces: [
        { id: 'e1', titulo: 'Hub de Datos', descripcion: 'Reportes y mapas', url: 'https://hub.sistemas.mec.gob.ar/mapas', icono: 'database', visible: true },
        { id: 'e2', titulo: 'Explorar', descripcion: '', url: '/explorar', icono: null, visible: true },
        { id: 'e3', titulo: 'Oculto', descripcion: '', url: 'https://oculto.mec.gob.ar', icono: null, visible: false },
      ],
    },
    {
      id: 'g2',
      titulo: 'Grupo sin visibles',
      enlaces: [
        { id: 'e4', titulo: 'Otro oculto', descripcion: '', url: 'https://otro.mec.gob.ar', icono: null, visible: false },
      ],
    },
  ],
}

describe('LinktreePagina', () => {
  it('muestra un único h1 con el título y el subtítulo', () => {
    render(<LinktreePagina config={config} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sistemas de Corrientes')
    expect(screen.getByText('Accesos del Ministerio')).toBeTruthy()
  })

  it('lista solo enlaces visibles y omite los grupos que quedan vacíos', () => {
    render(<LinktreePagina config={config} />)
    expect(screen.getByRole('heading', { name: 'Datos' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Grupo sin visibles' })).toBeNull()
    expect(screen.queryByText('Oculto')).toBeNull()
    expect(screen.getAllByRole('link', { name: /Hub de Datos|Explorar/ })).toHaveLength(2)
  })

  it('abre los enlaces externos en pestaña nueva con rel seguro y avisa a lectores de pantalla', () => {
    render(<LinktreePagina config={config} />)
    const externo = screen.getByRole('link', { name: /Hub de Datos/ })
    expect(externo.getAttribute('href')).toBe('https://hub.sistemas.mec.gob.ar/mapas')
    expect(externo.getAttribute('target')).toBe('_blank')
    expect(externo.getAttribute('rel')).toBe('noopener noreferrer')
    expect(externo.textContent).toContain('se abre en una pestaña nueva')
  })

  it('mantiene las rutas propias en la misma pestaña', () => {
    render(<LinktreePagina config={config} />)
    const propio = screen.getByRole('link', { name: /Explorar/ })
    expect(propio.getAttribute('target')).toBeNull()
    expect(propio.textContent).not.toContain('pestaña nueva')
  })

  it('muestra el dominio solo si está activado', () => {
    const { rerender } = render(<LinktreePagina config={config} />)
    expect(screen.getByText('hub.sistemas.mec.gob.ar')).toBeTruthy()
    rerender(<LinktreePagina config={{ ...config, mostrarDominio: false }} />)
    expect(screen.queryByText('hub.sistemas.mec.gob.ar')).toBeNull()
  })

  it('muestra la firma institucional solo si está activada', () => {
    const { rerender, container } = render(<LinktreePagina config={config} />)
    expect(container.querySelectorAll('img[src^="/marca/"]').length).toBeGreaterThan(0)
    rerender(<LinktreePagina config={{ ...config, mostrarLogo: false }} />)
    expect(container.querySelectorAll('img[src^="/marca/"]')).toHaveLength(0)
  })

  it('aplica el acento elegido y muestra el pie solo cuando existe', () => {
    const { container, rerender } = render(<LinktreePagina config={{ ...config, acento: 'celeste' }} />)
    expect(container.querySelector('[data-acento="celeste"]')).toBeTruthy()
    expect(screen.getByText('Soporte: sistemas@ejemplo.gob.ar')).toBeTruthy()
    rerender(<LinktreePagina config={{ ...config, pie: '' }} />)
    expect(screen.queryByText('Soporte: sistemas@ejemplo.gob.ar')).toBeNull()
  })

  it('deja siempre un acceso discreto "Admin" al pie que lleva al alta de enlaces', () => {
    const { rerender } = render(<LinktreePagina config={{ ...config, pie: '' }} />)
    const pie = screen.getByRole('contentinfo')
    expect(within(pie).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/links/admin')
    rerender(<LinktreePagina config={{ ...config, grupos: [] }} />)
    expect(screen.getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/links/admin')
  })

  it('explica por qué está vacía cuando no hay enlaces visibles', () => {
    render(<LinktreePagina config={{ ...config, grupos: [] }} />)
    const vacio = screen.getByRole('status')
    expect(within(vacio).getByText(/Todavía no hay accesos publicados/)).toBeTruthy()
    expect(within(screen.getByRole('main')).queryByRole('link')).toBeNull()
  })

  it('ofrece cambiar de tema con un nombre accesible', () => {
    render(<LinktreePagina config={config} />)
    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toBeTruthy()
  })
})
