import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({ riskEngineEnabled: () => true }))
vi.mock('@/lib/infraestructura/episodios-derivados/flags', () => ({ episodiosDerivadosEnabled: () => true }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))

import AdminLayout from './layout'

describe('admin layout access policy', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset()
  })

  it('passes the effective server policy through to the admin shell', async () => {
    const hubPolicy = { enabledSections: ['maps'] as const, landing: false }
    mocks.getSessionUser.mockResolvedValue({ role: 'admin', banned: false, hubPolicy })
    const result = await AdminLayout({ children: 'Admin content' })
    expect(result.props.hubPolicy).toBe(hubPolicy)
  })

  it('keeps unauthenticated admin recovery routed through login', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    await expect(AdminLayout({ children: 'Admin content' })).rejects.toThrow('REDIRECT:/login?callbackUrl=/admin')
  })
})
