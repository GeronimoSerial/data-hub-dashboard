import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'

const mocks = vi.hoisted(() => ({
  requireServerHubPageAccess: vi.fn(),
  hasBookletCapability: vi.fn(),
  isBookletAdmin: vi.fn(),
  resolveViewAsActor: vi.fn(),
  listViewAsCandidates: vi.fn(),
}))

vi.mock('@/lib/hub-entry-server', () => ({ requireServerHubPageAccess: mocks.requireServerHubPageAccess }))
vi.mock('@/lib/cuadernillos/permissions', () => ({
  hasBookletCapability: mocks.hasBookletCapability,
  isBookletAdmin: mocks.isBookletAdmin,
}))
vi.mock('@/lib/cuadernillos/view-as', () => ({
  resolveViewAsActor: mocks.resolveViewAsActor,
  listViewAsCandidates: mocks.listViewAsCandidates,
}))

import CuadernillosPage from './page'

const actor: SessionUser = {
  id: 'viewer-1', role: 'consulta', banned: false,
  nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}
const admin: SessionUser = { ...actor, id: 'admin-1', role: 'admin' }
const target: SessionUser = { id: 'supervisor-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'seleccionados', recursoIds: [] }
const noParams = { searchParams: Promise.resolve({}) }

describe('CuadernillosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireServerHubPageAccess.mockResolvedValue(actor)
    mocks.hasBookletCapability.mockImplementation(async (_actor: SessionUser, capability: string) => capability === 'cabecera')
    mocks.isBookletAdmin.mockResolvedValue(false)
    mocks.resolveViewAsActor.mockImplementation(async (current: SessionUser) => ({ status: 'self', actor: current }))
    mocks.listViewAsCandidates.mockResolvedValue([])
  })

  it('requires the hub section and shows only account-bound module capabilities', async () => {
    const page = await CuadernillosPage(noParams)

    expect(mocks.requireServerHubPageAccess).toHaveBeenCalledWith('/cuadernillos', 'cuadernillos')
    expect(mocks.hasBookletCapability).toHaveBeenCalledTimes(3)
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'planning')
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'cabecera')
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'supervisor')
    expect(page.props.capabilities).toEqual(['cabecera'])
    expect(page.props.isAdmin).toBe(false)
    expect(page.props.viewAs).toBeNull()
  })

  it('fails closed with no module capability even when the hub section is allowed', async () => {
    mocks.hasBookletCapability.mockResolvedValue(false)

    const page = await CuadernillosPage(noParams)

    expect(page.props.capabilities).toEqual([])
  })

  it('derives admin state server-side and offers the account picker only to admins', async () => {
    mocks.requireServerHubPageAccess.mockResolvedValue(admin)
    mocks.isBookletAdmin.mockResolvedValue(true)
    mocks.listViewAsCandidates.mockResolvedValue([{ userId: 'supervisor-1', name: 'Supervisora', email: 's@example.test', capabilities: ['supervisor'] }])

    const page = await CuadernillosPage(noParams)

    expect(mocks.isBookletAdmin).toHaveBeenCalledWith(admin)
    expect(mocks.listViewAsCandidates).toHaveBeenCalledWith(admin)
    expect(page.props.isAdmin).toBe(true)
    expect(page.props.viewAsCandidates).toHaveLength(1)
  })

  it('renders the viewed account capabilities and banner target when an admin views as an account', async () => {
    mocks.requireServerHubPageAccess.mockResolvedValue(admin)
    mocks.isBookletAdmin.mockResolvedValue(true)
    mocks.resolveViewAsActor.mockResolvedValue({ status: 'viewing', actor: target, target: { userId: 'supervisor-1', name: 'Supervisora' } })
    mocks.hasBookletCapability.mockImplementation(async (_actor: SessionUser, capability: string) => capability === 'supervisor')

    const page = await CuadernillosPage({ searchParams: Promise.resolve({ viewAs: 'supervisor-1' }) })

    expect(mocks.resolveViewAsActor).toHaveBeenCalledWith(admin, 'supervisor-1')
    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(target, 'supervisor')
    expect(page.props.capabilities).toEqual(['supervisor'])
    expect(page.props.viewAs).toEqual({ userId: 'supervisor-1', name: 'Supervisora' })
  })

  it('flags an unavailable requested account without changing the real actor capabilities', async () => {
    mocks.resolveViewAsActor.mockResolvedValue({ status: 'unavailable' })

    const page = await CuadernillosPage({ searchParams: Promise.resolve({ viewAs: 'banned-1' }) })

    expect(mocks.hasBookletCapability).toHaveBeenCalledWith(actor, 'cabecera')
    expect(page.props.viewAs).toBeNull()
    expect(page.props.viewAsUnavailable).toBe(true)
  })
})
