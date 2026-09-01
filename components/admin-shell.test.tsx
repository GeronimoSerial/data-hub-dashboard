// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminShell } from './admin-shell'

const state = vi.hoisted(() => ({
  searchParams: new URLSearchParams('section=recursos'),
  router: { push: vi.fn(), replace: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useSearchParams: () => state.searchParams,
  useRouter: () => state.router,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('AdminShell navigation contract', () => {
  beforeEach(() => {
    state.searchParams = new URLSearchParams('section=recursos')
    state.router.push.mockReset()
    state.router.replace.mockReset()
    window.history.replaceState({}, '', '/admin?section=recursos')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps desktop and mobile links on the same canonical section URLs', () => {
    render(<AdminShell role="admin"><p>Contenido</p></AdminShell>)
    const recursos = screen.getAllByRole('link', { name: /recursos/i })
    expect(recursos).toHaveLength(2)
    expect(recursos.every((link) => link.getAttribute('href') === '/admin?section=recursos')).toBe(true)
    expect(screen.getAllByRole('link', { name: /usuarios/i })).toHaveLength(2)
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(2)
  })

  it('migrates a historical hash to the canonical query and removes the hash', () => {
    state.searchParams = new URLSearchParams()
    state.router.replace.mockImplementation((href: string) => {
      window.history.replaceState({}, '', href)
    })
    window.history.replaceState({}, '', '/admin#usuarios')
    render(<AdminShell role="admin"><p>Contenido</p></AdminShell>)
    expect(state.router.replace).toHaveBeenCalledWith('/admin?section=usuarios')
    expect(window.location.hash).toBe('')
  })

  it('normalizes an invalid or disallowed query to resources', () => {
    state.searchParams = new URLSearchParams('section=usuarios')
    render(<AdminShell role="editor"><p>Contenido</p></AdminShell>)
    expect(screen.getAllByRole('link', { current: 'page' }).every((link) =>
      link.getAttribute('href') === '/admin?section=recursos')).toBe(true)
    expect(state.router.replace).toHaveBeenCalledWith('/admin?section=recursos')
  })

  it('updates active controls when Back/Forward provides a new searchParams snapshot', () => {
    const view = render(<AdminShell role="admin"><p>Contenido</p></AdminShell>)
    expect(screen.getAllByRole('link', { current: 'page' })[0]).toHaveAttribute('href', '/admin?section=recursos')

    state.searchParams = new URLSearchParams('section=tags')
    view.rerender(<AdminShell role="admin"><p>Contenido</p></AdminShell>)
    expect(screen.getAllByRole('link', { current: 'page' })[0]).toHaveAttribute('href', '/admin?section=tags')
    expect(screen.getAllByRole('link', { name: /^tags$/i }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })
})
