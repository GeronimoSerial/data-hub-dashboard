// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from './app-shell'

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
vi.mock('@/components/marca', () => ({ MarcaBanda: () => <img className="app-header__logo" alt="Gobierno de Corrientes · Ministerio de Educación" />, MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

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
      expect(band.contains(logo)).toBe(true)
      expect((logo.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()
      expect(document.querySelector('header.app-header')).toHaveClass('app-header--mapa')
      expect(document.querySelector('header.app-header')).toHaveAttribute('data-compacto', 'true')
    },
  )

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
})
