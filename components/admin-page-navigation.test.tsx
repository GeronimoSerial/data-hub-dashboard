// @vitest-environment jsdom
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AdminPageTabs } from './admin-page'
import { AdminShell, useAdminSection } from './admin-shell'

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

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <div data-value={value}>
      {children}
      <button type="button" onClick={() => onValueChange('tags')}>Elegir Tags</button>
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTab: ({ value, children }: { value: string; children: React.ReactNode }) => <span data-section={value}>{children}</span>,
}))

function TabsHarness() {
  const { section, navigate } = useAdminSection()
  return <AdminPageTabs tab={section} onTab={navigate} role="admin" />
}

describe('AdminPage tabs navigation', () => {
  beforeEach(() => {
    state.searchParams = new URLSearchParams('section=recursos')
    state.router.push.mockReset()
    state.router.replace.mockReset()
  })

  it('routes a tab selection through AdminShell context and canonical push', () => {
    render(<AdminShell role="admin"><TabsHarness /></AdminShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Tags' }))
    expect(state.router.push).toHaveBeenCalledTimes(1)
    expect(state.router.push).toHaveBeenCalledWith('/admin?section=tags')
  })
})
