// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExplorePage } from './explore-page'

const state = vi.hoisted(() => ({
  pathname: '/explorar',
  searchParams: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => state.searchParams,
  useRouter: () => state.router,
}))

vi.mock('@/components/hub-data', () => ({
  useHubData: () => ({
    recursos: [
      {
        id: 'r1', titulo: 'Matrícula', descripcion: 'Goya datos', formato: 'mapa',
        nivelId: 'primario', tipoId: 'informe', categoriaId: 'matricula', tagIds: [],
        area: 'Área', actualizado: '2026-01-01', estado: 'publicado', storageKey: 'r1/file',
      },
      {
        id: 'r2', titulo: 'Trayectorias', descripcion: 'Datos', formato: 'mapa',
        nivelId: 'secundario', tipoId: 'georref', categoriaId: 'trayectorias', tagIds: [],
        area: 'Área', actualizado: '2026-01-01', estado: 'publicado', ruta: '/mapas/trayectorias',
      },
    ],
    categorias: [
      { id: 'matricula', nombre: 'Matrícula' },
      { id: 'trayectorias', nombre: 'Trayectorias' },
    ],
    niveles: [
      { id: 'primario', nombre: 'Primario' },
      { id: 'secundario', nombre: 'Secundario' },
    ],
  }),
}))

vi.mock('@/components/resource-card', () => ({
  ResourceCard: ({ recurso, onNavigate }: { recurso: { id: string; titulo: string }; onNavigate?: () => void }) => (
    <a href={`/recursos/${recurso.id}`} data-resource-id={recurso.id} onClick={onNavigate}>{recurso.titulo}</a>
  ),
}))

vi.mock('@/components/explore-filters-sheet', () => ({
  Filter: ({ label, onValueChange }: { label: string; onValueChange: (value: string) => void }) => (
    <button aria-label={label} onClick={() => onValueChange(label === 'Nivel' ? 'secundario' : label === 'Formato' ? 'reporte' : 'matricula')}>
      {label}
    </button>
  ),
  MobileFilters: ({ onApply }: { onApply: (value: { tema: string }) => void }) => (
    <div>
      <button aria-label="Aplicar filtros móvil" onClick={() => onApply({ tema: 'matricula' })}>Aplicar filtros móvil</button>
      <button aria-label="Cancelar filtros móvil">Cancelar filtros móvil</button>
    </div>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

function reset(path = '/explorar', query = '') {
  state.pathname = path
  state.searchParams = new URLSearchParams(query)
  state.router.push.mockReset()
  state.router.replace.mockReset()
  sessionStorage.clear()
  window.history.replaceState({}, '', `${path}${query ? `?${query}` : ''}`)
}

describe('ExplorePage navigation policy', () => {
  beforeEach(() => reset())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('pushes a new history entry for a submitted search and focuses results after URL update', () => {
    const view = render(<ExplorePage />)
    const input = screen.getByRole('textbox', { name: /buscar en el catálogo/i })
    fireEvent.change(input, { target: { value: '  Goya  ' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(state.router.push).toHaveBeenCalledTimes(1)
    expect(state.router.push).toHaveBeenCalledWith('/explorar?q=goya')
    expect(state.router.replace).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Resultados' }))

    state.searchParams = new URLSearchParams('q=goya')
    window.history.replaceState({}, '', '/explorar?q=goya')
    view.rerender(<ExplorePage />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultados' }))
  })

  it('replaces incremental filters and clearing instead of pushing history', () => {
    reset('/explorar', 'q=goya&tema=matricula&nivel=primario&formato=mapa')
    render(<ExplorePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nivel' }))
    expect(state.router.replace).toHaveBeenCalledWith('/explorar?q=goya&tema=matricula&nivel=secundario&formato=mapa')
    expect(state.router.push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /limpiar$/i }))
    expect(state.router.replace).toHaveBeenLastCalledWith('/explorar')
    expect(state.router.push).not.toHaveBeenCalled()
  })

  it('canonicalizes an invalid URL once without creating an effect loop', () => {
    reset('/explorar', 'nivel=unknown&tema=matricula&q=Goya&noise=1')
    render(<ExplorePage />)
    expect(state.router.replace).toHaveBeenCalledTimes(1)
    expect(state.router.replace).toHaveBeenCalledWith('/explorar?q=goya&tema=matricula')
  })

  it('applies mobile draft once using the same replace policy', () => {
    render(<ExplorePage />)
    fireEvent.click(screen.getByRole('button', { name: /aplicar filtros móvil/i }))
    expect(state.router.replace).toHaveBeenCalledTimes(1)
    expect(state.router.replace).toHaveBeenCalledWith('/explorar?tema=matricula')
    expect(state.router.push).not.toHaveBeenCalled()
  })

  it('restores return scroll and the previously focused card by URL', () => {
    reset('/explorar', 'q=goya&tema=matricula&nivel=primario&formato=mapa')
    sessionStorage.setItem(
      'hub-explore-return:/explorar?q=goya&tema=matricula&nivel=primario&formato=mapa',
      JSON.stringify({ scrollY: 840, resourceId: 'r1' }),
    )
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<ExplorePage />)

    expect(scrollTo).toHaveBeenCalledWith({ top: 840, behavior: 'auto' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toHaveAttribute('data-resource-id', 'r1')
  })

  it('rederives controls and results when Back/Forward changes all four URL filters', () => {
    reset('/explorar', 'q=goya&tema=matricula&nivel=primario&formato=mapa')
    const view = render(<ExplorePage />)
    expect(screen.getByLabelText('Filtros activos')).toHaveTextContent(/goya.*matrícula.*primario.*mapa/i)
    expect(document.querySelector('[data-resource-id="r1"]')).toBeInTheDocument()
    expect(document.querySelector('[data-resource-id="r2"]')).not.toBeInTheDocument()

    state.searchParams = new URLSearchParams('q=trayectorias&tema=trayectorias&nivel=secundario&formato=mapa')
    window.history.replaceState({}, '', '/explorar?q=trayectorias&tema=trayectorias&nivel=secundario&formato=mapa')
    view.rerender(<ExplorePage />)
    expect(screen.getByLabelText('Filtros activos')).toHaveTextContent(/trayectorias.*secundario.*mapa/i)
    expect(document.querySelector('[data-resource-id="r2"]')).toBeInTheDocument()
    expect(document.querySelector('[data-resource-id="r1"]')).not.toBeInTheDocument()
  })
})
