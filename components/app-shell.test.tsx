// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from './app-shell'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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
vi.mock('@/components/marca', () => ({ MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

afterEach(() => {
  cleanup()
  push.mockClear()
  document.body.innerHTML = ''
})

describe('AppShell', () => {
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
