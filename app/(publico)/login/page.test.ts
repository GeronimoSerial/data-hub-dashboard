import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  migrarDb: vi.fn(),
  resolveEntry: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db', () => ({ migrarDb: mocks.migrarDb }))
vi.mock('@/lib/hub-entry-server', () => ({ resolveServerHubEntry: mocks.resolveEntry }))

import LoginPage from './page'

describe('public login entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.migrarDb.mockResolvedValue(undefined)
  })

  it('resolves signed-in users against the safe server destination policy', async () => {
    const user = { id: 'map-user' }
    mocks.getSessionUser.mockResolvedValue(user)
    mocks.resolveEntry.mockResolvedValue('/mapas/infraestructura?cue=1')
    await expect(LoginPage({ searchParams: Promise.resolve({ callbackUrl: '/mapas/infraestructura?cue=1' }) }))
      .rejects.toThrow('REDIRECT:/mapas/infraestructura?cue=1')
    expect(mocks.resolveEntry).toHaveBeenCalledWith(user, { callbackUrl: '/mapas/infraestructura?cue=1' })
  })

  it('shows login for an expired session without resolving a callback', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    const result = await LoginPage({ searchParams: Promise.resolve({ callbackUrl: '/mapas?x=1' }) })
    expect(result).toBeTruthy()
    expect(mocks.resolveEntry).not.toHaveBeenCalled()
  })
})
