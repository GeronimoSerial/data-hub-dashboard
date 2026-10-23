import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), ensureSeeded: vi.fn(), post: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/auth', () => ({ auth: {} }))
vi.mock('better-auth/next-js', () => ({ toNextJsHandler: () => ({ GET: mocks.get, POST: mocks.post }) }))

import { POST } from './route'

describe('Better Auth route ban guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureSeeded.mockResolvedValue(undefined)
    mocks.post.mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('denies a banned active session before Better Auth can mutate its password', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'banned-user', banned: true })
    const response = await POST(new Request('http://localhost/api/auth/change-password', { method: 'POST' }))
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('continues to Better Auth for unbanned credential changes and other auth flows', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'active-user', banned: false })
    const request = new Request('http://localhost/api/auth/change-password', { method: 'POST' })
    await POST(request)
    expect(mocks.post).toHaveBeenCalledWith(request)

    const signOut = new Request('http://localhost/api/auth/sign-out', { method: 'POST' })
    await POST(signOut)
    expect(mocks.post).toHaveBeenCalledWith(signOut)
    const banUser = new Request('http://localhost/api/auth/admin/ban-user', { method: 'POST' })
    await POST(banUser)
    expect(mocks.post).toHaveBeenCalledWith(banUser)
    expect(mocks.getSessionUser).toHaveBeenCalledTimes(1)
  })
})
