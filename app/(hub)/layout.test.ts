import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSessionUser: vi.fn(),
  getShellUser: vi.fn(),
  migrarDb: vi.fn(),
  ensureSeeded: vi.fn(),
  loadCatalogFor: vi.fn(),
  resolveEntry: vi.fn(),
  policyAllowed: vi.fn(),
  aclAllowed: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser, getShellUser: mocks.getShellUser }))
vi.mock('@/lib/db', () => ({ migrarDb: mocks.migrarDb }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/db/hub-catalog-for', () => ({ loadCatalogFor: mocks.loadCatalogFor }))
vi.mock('@/lib/hub-entry-server', () => ({
  resolveServerHubEntry: mocks.resolveEntry,
  serverHubPathAllowedByPolicy: mocks.policyAllowed,
  serverHubPathAllowedByExistingAcl: mocks.aclAllowed,
}))

import HubLayout from './layout'

const signedIn = {
  id: 'map-user', role: 'consulta' as const, banned: false,
  nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [],
  hubPolicy: { enabledSections: ['maps'] as const, landing: false }, hubDestination: '/mapas',
}

describe('protected hub layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers({ 'x-hub-request-url': '/' }))
    mocks.getSessionUser.mockResolvedValue(signedIn)
    mocks.getShellUser.mockResolvedValue({ name: 'Map user', role: 'consulta' })
    mocks.migrarDb.mockResolvedValue(undefined)
    mocks.ensureSeeded.mockResolvedValue(undefined)
    mocks.loadCatalogFor.mockResolvedValue({ recursos: [] })
    mocks.policyAllowed.mockImplementation(async (_user, path) => path !== '/')
    mocks.aclAllowed.mockResolvedValue(true)
  })

  it('redirects expired/anonymous sessions before seeding or loading catalog data', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    mocks.headers.mockResolvedValue(new Headers({ 'x-hub-request-url': '/mapas/matricula?zoom=3' }))
    await expect(HubLayout({ children: null })).rejects.toThrow('REDIRECT:/login?callbackUrl=%2Fmapas%2Fmatricula%3Fzoom%3D3')
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
    expect(mocks.loadCatalogFor).not.toHaveBeenCalled()
  })

  it('sends banned accounts to the shell-free no-access state', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...signedIn, banned: true })
    await expect(HubLayout({ children: null })).rejects.toThrow('REDIRECT:/forbidden')
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
    expect(mocks.loadCatalogFor).not.toHaveBeenCalled()
  })

  it('sends a map-only user away from landing before loading the protected shell', async () => {
    mocks.resolveEntry.mockResolvedValue('/mapas')
    await expect(HubLayout({ children: null })).rejects.toThrow('REDIRECT:/mapas')
    expect(mocks.resolveEntry).toHaveBeenCalledWith(signedIn, { currentPath: '/' })
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
    expect(mocks.loadCatalogFor).not.toHaveBeenCalled()
  })

  it('loads catalog only after an authenticated, permitted section entry', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-hub-request-url': '/mapas?zoom=2' }))
    const result = await HubLayout({ children: 'map page' })
    expect(mocks.ensureSeeded).toHaveBeenCalledOnce()
    expect(mocks.loadCatalogFor).toHaveBeenCalledWith(signedIn)
    expect(result).toBeTruthy()
  })

  it('rechecks revoked section access on the server before rendering or loading catalog', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-hub-request-url': '/mapas?zoom=2' }))
    mocks.policyAllowed.mockResolvedValue(false)
    mocks.resolveEntry.mockResolvedValue(null)
    await expect(HubLayout({ children: 'map page' })).rejects.toThrow('REDIRECT:/forbidden')
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
    expect(mocks.loadCatalogFor).not.toHaveBeenCalled()
  })
})
