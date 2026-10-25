// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), currentUser: vi.fn(), resolveEntry: vi.fn(), select: vi.fn(), where: vi.fn(), limit: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.currentUser }))
vi.mock('@/lib/hub-entry-server', () => ({ resolveServerHubEntry: mocks.resolveEntry }))
vi.mock('./account-actions', () => ({ AccountActions: () => <button type="button">Cerrar sesión</button> }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: mocks.select }) }))
vi.mock('@/lib/db/schema', () => ({ account: { id: 'id', userId: 'userId', providerId: 'providerId', password: 'password' } }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), isNotNull: vi.fn() }))
vi.mock('./change-password-form', () => ({ ChangePasswordForm: () => <div>change-form</div> }))

import CuentaPage from './page'
import { render, screen } from '@testing-library/react'

describe('CuentaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ banned: false, hubPolicy: { enabledSections: [] } })
    mocks.resolveEntry.mockResolvedValue(null)
    mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) })
    mocks.where.mockReturnValue({ limit: mocks.limit })
    mocks.limit.mockResolvedValue([{ id: 'credential-account' }])
  })

  it('redirects an expired or anonymous session to login without a callback loop', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(CuentaPage()).rejects.toThrow('REDIRECT:/login')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('serves section-only accounts independently of the catalog and permits password recovery from no-access', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'restricted', banned: true } })
    mocks.currentUser.mockResolvedValue({ banned: true, hubPolicy: { enabledSections: [] } })
    render(await CuentaPage())
    expect(screen.queryByRole('link', { name: 'Volver al acceso permitido' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('does not show the change form to accounts without a credential password', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'sso-only' } })
    mocks.resolveEntry.mockResolvedValue('/mapas/infraestructura')
    mocks.limit.mockResolvedValue([])
    render(await CuentaPage())
    expect(screen.getByRole('link', { name: 'Volver al acceso permitido' }).getAttribute('href')).toBe('/mapas/infraestructura')
  })
})
