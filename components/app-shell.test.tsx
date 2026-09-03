// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from './app-shell'

const state = vi.hoisted(() => ({
  pathname: '/recursos/r1',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/app/providers', () => ({
  useThemeMode: () => ({ mode: 'light', setMode: vi.fn() }),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ isPending: false, data: { user: undefined } }),
    signOut: vi.fn(async () => undefined),
  },
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('button', props, children),
}))
vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  MenuTrigger: ({ render, children }: { render: React.ReactElement; children?: React.ReactNode }) =>
    React.cloneElement(render, {}, children),
  MenuContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  MenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children),
}))

describe('AppShell resource details state', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    state.pathname = '/recursos/r1'
  })

  it('resets expanded details when navigating from one resource id to another', () => {
    const view = render(<AppShell><p>Contenido</p></AppShell>)
    const toggle = () => screen.getByRole('button', { name: /mostrar detalles/i })

    fireEvent.click(toggle())
    expect(screen.getByRole('button', { name: /ocultar detalles/i })).toHaveAttribute('aria-expanded', 'true')

    state.pathname = '/recursos/r2'
    view.rerender(<AppShell><p>Contenido</p></AppShell>)
    expect(screen.getByRole('button', { name: /mostrar detalles/i })).toHaveAttribute('aria-expanded', 'false')
  })
})
