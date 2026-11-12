import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'

const mocks = vi.hoisted(() => ({
  requireServerHubPageAccess: vi.fn(),
  hasBookletCapability: vi.fn(),
}))

vi.mock('@/lib/hub-entry-server', () => ({ requireServerHubPageAccess: mocks.requireServerHubPageAccess }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ hasBookletCapability: mocks.hasBookletCapability }))

import CuadernillosPage from './page'

const actor: SessionUser = {
  id: 'viewer-1', role: 'consulta', banned: false,
  nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}

describe('CuadernillosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireServerHubPageAccess.mockResolvedValue(actor)
    mocks.hasBookletCapability.mockImplementation(async (_actor: SessionUser, capability: string) => capability === 'cabecera')
  })

  it('requires the hub section and shows only account-bound module capabilities', async () => {
    const page = await CuadernillosPage()

    expect(mocks.requireServerHubPageAccess).toHaveBeenCalledWith('/cuadernillos', 'cuadernillos')
    expect(mocks.hasBookletCapability).toHaveBeenCalledTimes(3)
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'planning')
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'cabecera')
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'supervisor')
    expect(page.props.capabilities).toEqual(['cabecera'])
  })

  it('passes no admin or view-as state to the workspace', async () => {
    const page = await CuadernillosPage()

    expect(Object.keys(page.props)).toEqual(['capabilities'])
  })

  it('fails closed with no module capability even when the hub section is allowed', async () => {
    mocks.hasBookletCapability.mockResolvedValue(false)

    const page = await CuadernillosPage()

    expect(page.props.capabilities).toEqual([])
  })
})
