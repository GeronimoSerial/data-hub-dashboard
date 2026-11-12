// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AppShell } from './app-shell'
import { shellNavAllowed, shellUserFor } from '@/lib/access/shell-nav'
import type { HubSection } from '@/lib/hub-sections'

const { push, route } = vi.hoisted(() => ({ push: vi.fn(), route: { pathname: '/' } }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/providers', () => ({ useThemeMode: () => ({ mode: 'light', setMode: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ isPending: true, data: null }),
    signOut: vi.fn(),
  },
}))
vi.mock('@/components/marca', () => ({ MarcaBanda: () => <img className="app-header__logo" src="/marca/logo-educacion-h-inv.svg" width={1051} height={208} alt="Gobierno de Corrientes · Ministerio de Educación" />, MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

afterEach(() => {
  cleanup()
  push.mockClear()
  route.pathname = '/'
  document.body.innerHTML = ''
})

describe('AppShell', () => {
  it('muestra la firma institucional completa fuera de las rutas de mapas', () => {
    render(<AppShell initialUser={null}>Contenido</AppShell>)
    expect(document.querySelector('.app-signature')).toBeInTheDocument()
    expect(document.querySelector('.app-header__logo')).not.toBeInTheDocument()
  })

  it.each(['/mapas/infraestructura', '/mapas/matricula'])(
    'usa la firma compacta en la banda para %s', (pathname) => {
      route.pathname = pathname
      render(<AppShell initialUser={null}>Contenido</AppShell>)

      expect(document.querySelector('.app-signature')).not.toBeInTheDocument()
      const band = document.querySelector('.app-header__band')
      const logo = band?.querySelector('.app-header__logo')
      const brand = screen.getByRole('link', { name: 'Hub de Datos, inicio' })
      if (!band || !logo) throw new Error('No se encontró la firma compacta en la banda')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveClass('app-header__logo')
      expect(logo).toHaveAttribute('src', '/marca/logo-educacion-h-inv.svg')
      expect(band.contains(logo)).toBe(true)
      expect((logo.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()
      expect(document.querySelector('header.app-header')).toHaveClass('app-header--mapa')
      expect(document.querySelector('header.app-header')).toHaveAttribute('data-compacto', 'true')
    },
  )

  it('no muestra MarcaBanda en /', () => {
    render(<AppShell initialUser={null}>Contenido</AppShell>)
    expect(document.querySelector('.app-header__logo')).not.toBeInTheDocument()
  })

  it('mantiene el header completo en /explorar', () => {
    route.pathname = '/explorar'
    render(<AppShell initialUser={null}>Contenido</AppShell>)
    expect(document.querySelector('.app-signature')).toBeInTheDocument()
    expect(document.querySelector('.app-header__logo')).not.toBeInTheDocument()
    expect(document.querySelector('header.app-header')).not.toHaveClass('app-header--mapa')
  })

  it('muestra Centro de Situación al personal cuando el flag está activo', async () => {
    render(<AppShell initialUser={{ name: 'Editora', role: 'editor' }} situacionEnabled>Contenido</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Centro de Situación' }))
    expect(push).toHaveBeenCalledWith('/situacion')
  })

  it('oculta Centro de Situación con flag apagado o rol sin permisos', async () => {
    const { rerender } = render(<AppShell initialUser={{ name: 'Editora', role: 'editor' }}>Contenido</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    expect(screen.queryByRole('menuitem', { name: 'Centro de Situación' })).not.toBeInTheDocument()
    rerender(<AppShell initialUser={{ name: 'Consulta', role: 'consulta' }} situacionEnabled>Contenido</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    expect(screen.queryByRole('menuitem', { name: 'Centro de Situación' })).not.toBeInTheDocument()
  })

  it('keeps an infrastructure-only user out of landing and explore chrome while preserving account recovery', async () => {
    route.pathname = '/mapas/infraestructura'
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta', hubPolicy: { enabledSections: ['infrastructure'], landing: false } }}>Contenido</AppShell>)
    expect(screen.queryByRole('link', { name: 'Hub de Datos, inicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Explorar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Buscar recursos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ENOS 2026/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('does not render section links (Mapas, Tableros) in the shell navigation', () => {
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta', hubPolicy: { enabledSections: ['maps', 'dashboards'], landing: false } }}>Contenido</AppShell>)
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Explorar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mapas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tableros' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ENOS 2026' })).not.toBeInTheDocument()
  })

  it('does not show a booklet entry in the main navigation; it lives in the map header', () => {
    render(<AppShell initialUser={{ name: 'Planificación', role: 'consulta', hubPolicy: { enabledSections: ['cuadernillos'], landing: false } }}>Contenido</AppShell>)
    expect(screen.queryByRole('link', { name: 'Cuadernillos' })).not.toBeInTheDocument()
  })

  it('preserves legacy defaults and removes section links for explicit no-access policy', () => {
    const { rerender } = render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta' }}>Contenido</AppShell>)
    expect(screen.getByRole('link', { name: 'Hub de Datos, inicio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar' })).toBeInTheDocument()
    rerender(<AppShell initialUser={{ name: 'Consulta', role: 'consulta', hubPolicy: { enabledSections: [], landing: false } }}>Contenido</AppShell>)
    expect(screen.queryByRole('link', { name: 'Hub de Datos, inicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Explorar' })).not.toBeInTheDocument()
  })

  it('keeps staff administration recovery while hiding disabled section destinations', async () => {
    render(<AppShell initialUser={{ name: 'Editora', role: 'editor', hubPolicy: { enabledSections: ['maps'], landing: false } }}>Contenido</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    expect(screen.getByRole('menuitem', { name: 'Administración' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Centro de Situación' })).not.toBeInTheDocument()
  })
})

describe('AppShell for confined roles', () => {
  it('hides the hub navigation and the logo link for a director de nivel', () => {
    render(<AppShell initialUser={{ name: 'Director', role: 'director_nivel' }}>Contenido</AppShell>)
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Explorar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Buscar recursos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hub de Datos, inicio' })).not.toBeInTheDocument()
  })

  it('keeps the hub navigation for a consulta user', () => {
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta' }}>Contenido</AppShell>)
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument()
  })
})

describe('AppShell primary navigation', () => {
  const navLinks = () => within(screen.getByRole('navigation', { name: 'Navegación principal' }))
    .queryAllByRole('link')
    .map((link) => link.textContent)

  it('muestra Inicio y Explorar al admin en /', () => {
    render(<AppShell initialUser={{ name: 'Admin', role: 'admin' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual(['Inicio', 'Explorar'])
  })

  it('no muestra items de navegación en /mapas/infraestructura para admin', () => {
    route.pathname = '/mapas/infraestructura'
    render(<AppShell initialUser={{ name: 'Admin', role: 'admin' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual([])
  })

  it('no muestra items de navegación en mapas para consulta', () => {
    route.pathname = '/mapas/infraestructura'
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual([])
  })

  it('no muestra items de hub a un director de nivel en /mapas/infraestructura', () => {
    route.pathname = '/mapas/infraestructura'
    render(<AppShell initialUser={{ name: 'Director', role: 'director_nivel' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual([])
  })

  it('no muestra Inicio ni Explorar a un operador de establecimiento', () => {
    render(<AppShell initialUser={{ name: 'Operador', role: 'operador_establecimiento' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual([])
  })

  it('muestra solo Explorar a una consulta sin landing', () => {
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta', hubPolicy: { enabledSections: ['explore'], landing: false } }}>Contenido</AppShell>)
    expect(navLinks()).toEqual(['Explorar'])
  })

  it('muestra solo Inicio a una consulta sin explore', () => {
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta', hubPolicy: { enabledSections: ['maps'], landing: true } }}>Contenido</AppShell>)
    expect(navLinks()).toEqual(['Inicio'])
  })

  it('muestra Inicio y Explorar a una consulta legacy', () => {
    render(<AppShell initialUser={{ name: 'Consulta', role: 'consulta' }}>Contenido</AppShell>)
    expect(navLinks()).toEqual(['Inicio', 'Explorar'])
  })
})

describe('AppShell search entries follow shellNavAllowed', () => {
  it.each([
    ['anonymous', null, undefined],
    ['admin', { name: 'Admin', role: 'admin' as const }, undefined],
    ['consulta with explore', { name: 'Consulta', role: 'consulta' as const }, undefined],
    ['consulta without explore', { name: 'Consulta', role: 'consulta' as const }, { enabledSections: ['maps'] as HubSection[], landing: false }],
    ['director de nivel', { name: 'Director', role: 'director_nivel' as const }, undefined],
  ])('%s: search button matches the navbar capability', (_label, user, hubPolicy) => {
    const initialUser = user === null ? null : { ...user, hubPolicy }
    render(<AppShell initialUser={initialUser}>Contenido</AppShell>)
    const expected = shellNavAllowed(
      user === null ? null : shellUserFor(user.role, hubPolicy),
      '/explorar',
    )
    expect(Boolean(screen.queryByRole('link', { name: 'Buscar recursos' }))).toBe(expected)
  })
})
