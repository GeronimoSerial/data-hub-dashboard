import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin', role: 'admin', banned: false },
  getSessionUser: vi.fn(), ensureSeeded: vi.fn(), createUser: vi.fn(), removeUser: vi.fn(),
  listHubUsers: vi.fn(), denied: vi.fn(), mutateDenied: vi.fn(),
  unknownNivelJurIds: vi.fn(), unknownRecursoIds: vi.fn(),
  persistUserAccessConfiguration: vi.fn(), validate: vi.fn(), allowed: vi.fn(), authApiError: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/auth', () => ({ auth: { api: { createUser: mocks.createUser, removeUser: mocks.removeUser } } }))
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: mocks.allowed }))
vi.mock('@/lib/usuarios', async () => {
  const actual = await vi.importActual<{ parseCreateUserBody: (body: unknown) => unknown }>('@/lib/usuarios')
  return {
  UNKNOWN_NIVELES_JUR_ERROR: 'unknown levels', UNKNOWN_RECURSOS_ERROR: 'unknown resources',
  authApiError: mocks.authApiError, listHubUsers: mocks.listHubUsers,
  listUsuariosDenied: mocks.denied, mutateUsuariosDenied: mocks.mutateDenied,
  parseCreateUserBody: actual.parseCreateUserBody,
  validateHubAccessSettings: mocks.validate, persistUserAccessConfiguration: mocks.persistUserAccessConfiguration,
  unknownNivelJurIds: mocks.unknownNivelJurIds,
  unknownRecursoIds: mocks.unknownRecursoIds,
  }
})

import { GET, POST } from './route'

const createRequest = (body: unknown) => new Request('http://localhost/api/usuarios', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const validBody = { email: 'new@example.com', name: 'New User', password: 'password1', role: 'consulta',
  nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'],
  hubAccess: { enabledSections: ['infrastructure'], landing: false, destination: '/mapas/infraestructura' } }

describe('/api/usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue(mocks.actor)
    mocks.denied.mockReturnValue(null); mocks.mutateDenied.mockReturnValue(null)
    mocks.unknownNivelJurIds.mockResolvedValue([]); mocks.unknownRecursoIds.mockResolvedValue([])
    mocks.validate.mockResolvedValue(true); mocks.allowed.mockResolvedValue(true)
    mocks.createUser.mockResolvedValue({ user: { id: 'created-1' } })
    mocks.authApiError.mockReturnValue({ status: 400, error: 'save failed' })
  })

  it('lists users for staff but restricts mutation to admins', async () => {
    mocks.denied.mockReturnValue({ status: 401, error: 'No autenticado' })
    expect((await GET()).status).toBe(401)
    mocks.denied.mockReturnValue(null); mocks.listHubUsers.mockResolvedValue([{ id: 'u1', hubPolicy: { enabledSections: [] } }])
    const listResponse = await GET()
    expect((await listResponse.json()).usuarios).toHaveLength(1)
    expect(listResponse.headers.get('Cache-Control')).toBe('private, no-store')
    for (const status of [401, 403]) {
      mocks.mutateDenied.mockReturnValue({ status, error: 'denied' })
      expect((await POST(createRequest(validBody))).status).toBe(status)
    }
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('creates a restricted user using the target ACL and persists every access dimension', async () => {
    const order: string[] = []
    mocks.createUser.mockImplementation(async () => { order.push('create'); return { user: { id: 'created-1' } } })
    mocks.persistUserAccessConfiguration.mockImplementation(async () => { order.push('persist-and-activate') })
    const response = await POST(createRequest(validBody))
    expect(response.status).toBe(201)
    expect(order).toEqual(['create', 'persist-and-activate'])
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ data: { banned: true, banReason: 'Provisioning' } }),
    }))
    expect(mocks.validate).toHaveBeenCalledWith(
      { hubPolicy: { enabledSections: ['infrastructure'], landing: false }, hubDestination: '/mapas/infraestructura' },
      expect.any(Function),
    )
    const acl = mocks.validate.mock.calls[0][1]
    expect(await acl('/mapas/infraestructura')).toBe(true)
    expect(mocks.allowed).toHaveBeenCalledWith(expect.objectContaining({ id: 'pending-user', role: 'consulta', nivelJurIds: [7], recursoIds: ['r7'] }), '/mapas/infraestructura')
    expect(mocks.persistUserAccessConfiguration).toHaveBeenCalledWith('created-1', expect.objectContaining({
      nivelJurIds: [7], recursoIds: ['r7'], hubAccess: expect.objectContaining({ hubDestination: '/mapas/infraestructura' }),
      activateProvisionedUser: true,
    }))
  })

  it('rejects forged/malformed sections, destinations, invalid ACL IDs and accepts explicit deny-all', async () => {
    for (const hubAccess of [
      { enabledSections: ['unknown'], landing: false, destination: null },
      { enabledSections: ['infrastructure'], landing: false, destination: 'https://evil.test' },
    ]) expect((await POST(createRequest({ ...validBody, hubAccess }))).status).toBe(400)
    mocks.unknownRecursoIds.mockResolvedValue(['missing'])
    expect((await POST(createRequest(validBody))).status).toBe(400)
    mocks.unknownRecursoIds.mockResolvedValue([])
    const noAccess = { ...validBody, hubAccess: { enabledSections: [], landing: false, destination: null } }
    expect((await POST(createRequest(noAccess))).status).toBe(201)
    expect(mocks.validate).not.toHaveBeenCalled()
  })

  it('keeps legacy defaults when hub settings are omitted and reports persistence failures', async () => {
    expect((await POST(createRequest({ ...validBody, hubAccess: undefined }))).status).toBe(201)
    expect(mocks.persistUserAccessConfiguration).toHaveBeenCalledWith('created-1', expect.objectContaining({ hubAccess: { hubPolicy: {}, hubDestination: null } }))
    mocks.persistUserAccessConfiguration.mockRejectedValueOnce(new Error('write failed'))
    expect((await POST(createRequest(validBody))).status).toBe(400)
    expect(mocks.removeUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: 'created-1' } }))
    expect(mocks.authApiError).toHaveBeenCalled()
  })

  it('keeps a failed provisioned user denied when cleanup fails', async () => {
    mocks.persistUserAccessConfiguration.mockRejectedValueOnce(new Error('activation transaction failed'))
    mocks.removeUser.mockRejectedValueOnce(new Error('cleanup failed'))

    const response = await POST(createRequest(validBody))

    expect(response.status).toBe(400)
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ data: { banned: true, banReason: 'Provisioning' } }),
    }))
    expect(mocks.persistUserAccessConfiguration).toHaveBeenCalledWith('created-1', expect.objectContaining({ activateProvisionedUser: true }))
    expect(mocks.removeUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: 'created-1' } }))
  })
})
