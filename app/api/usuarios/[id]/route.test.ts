import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin', role: 'admin', banned: false }, getSessionUser: vi.fn(), ensureSeeded: vi.fn(),
  getDb: vi.fn(), select: vi.fn(), from: vi.fn(), where: vi.fn(),
  getHubUserSession: vi.fn(), listHubUsers: vi.fn(), denied: vi.fn(), mutateDenied: vi.fn(),
  levels: vi.fn(), resources: vi.fn(), admins: vi.fn(), lastAdmin: vi.fn(),
  persistAccess: vi.fn(), validate: vi.fn(), allowed: vi.fn(),
  setRole: vi.fn(), ban: vi.fn(), unban: vi.fn(), password: vi.fn(), updateUser: vi.fn(), authError: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }))
// Fixture: la auditoría escribe en auditoriaEvento a través del db mockeado.
vi.mock('@/lib/db/schema', () => ({ user: { id: 'user.id' }, auditoriaEvento: {} }))
vi.mock('drizzle-orm', () => ({ eq: (...args: unknown[]) => args }))
vi.mock('@/lib/auth', () => ({ auth: { api: {
  setRole: mocks.setRole, banUser: mocks.ban, unbanUser: mocks.unban,
  setUserPassword: mocks.password, adminUpdateUser: mocks.updateUser,
} } }))
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: mocks.allowed }))
vi.mock('@/lib/usuarios', async () => {
  const actual = await vi.importActual<{
    parsePatchUserBody: (body: unknown) => unknown
    wouldRemoveLastAdmin: (options: { targetId: string; unbannedAdminIds: string[]; nextRole?: string; nextBanned?: boolean }) => boolean
  }>('@/lib/usuarios')
  return {
    LAST_ADMIN_ERROR: 'last admin', UNKNOWN_NIVELES_JUR_ERROR: 'unknown levels', UNKNOWN_RECURSOS_ERROR: 'unknown resources',
    authApiError: mocks.authError, getHubUserSession: mocks.getHubUserSession, listHubUsers: mocks.listHubUsers,
    listUsuariosDenied: mocks.denied, mutateUsuariosDenied: mocks.mutateDenied,
    parsePatchUserBody: actual.parsePatchUserBody, persistUserAccessConfiguration: mocks.persistAccess,
    validateHubAccessSettings: mocks.validate,
    unbannedAdminIds: mocks.admins, unknownNivelJurIds: mocks.levels, unknownRecursoIds: mocks.resources,
    wouldRemoveLastAdmin: actual.wouldRemoveLastAdmin,
  }
})

import { GET, PATCH } from './route'

const context = { params: Promise.resolve({ id: 'target' }) }
const patch = (body: unknown) => PATCH(new Request('http://localhost/api/usuarios/target', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), context)
const target = { id: 'target', role: 'consulta', banned: false, nivelJurIds: [1], accesoRecursos: 'todos', recursoIds: [],
  hubPolicy: { enabledSections: ['infrastructure'], landing: false }, hubDestination: '/mapas/infraestructura', cueAnexo: null }

describe('/api/usuarios/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue(mocks.actor); mocks.denied.mockReturnValue(null); mocks.mutateDenied.mockReturnValue(null)
    // Fixture: la auditoría abre una transacción y escribe su evento; el chain mockeado la acepta sin base real.
    const db: { select: typeof mocks.select; transaction?: (fn: (tx: unknown) => unknown) => unknown; insert?: () => unknown } = { select: mocks.select }
    db.transaction = async (fn) => fn(db)
    db.insert = () => ({ values: async () => undefined })
    mocks.getDb.mockReturnValue(db); mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where }); mocks.where.mockResolvedValue([{ id: 'target' }])
    mocks.getHubUserSession.mockResolvedValue(target); mocks.listHubUsers.mockResolvedValue([target])
    mocks.levels.mockResolvedValue([]); mocks.resources.mockResolvedValue([]); mocks.admins.mockResolvedValue(['admin', 'target'])
    mocks.validate.mockImplementation(async (settings, acl) => acl(settings.hubDestination ?? '/'))
    mocks.allowed.mockResolvedValue(true); mocks.lastAdmin.mockReturnValue(false)
    for (const fn of [mocks.persistAccess, mocks.setRole, mocks.ban, mocks.unban, mocks.password, mocks.updateUser]) fn.mockResolvedValue(undefined)
    mocks.authError.mockReturnValue({ status: 400, error: 'write failed' })
  })

  it('allows staff read, returns uncached user details, and restricts mutation to admins', async () => {
    expect((await GET(new Request('http://localhost'), context)).headers.get('Cache-Control')).toBe('private, no-store')
    for (const status of [401, 403]) {
      mocks.mutateDenied.mockReturnValue({ status, error: 'denied' })
      expect((await patch({ name: 'Updated' })).status).toBe(status)
    }
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('validates the merged target ACL, then changes self-edit/role/scope, policy and destination', async () => {
    mocks.actor.id = 'target'
    mocks.getHubUserSession.mockResolvedValue({ ...target, banned: true })
    mocks.admins.mockResolvedValue(['target', 'admin'])
    const result = await patch({ role: 'editor', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'],
      banned: false, hubAccess: { enabledSections: ['maps'], landing: false, destination: '/mapas' }, name: 'Updated' })
    expect(result.status).toBe(200)
    expect(mocks.validate).toHaveBeenCalledWith(
      { hubPolicy: { enabledSections: ['maps'], landing: false }, hubDestination: '/mapas' }, expect.any(Function),
    )
    expect(mocks.allowed).toHaveBeenCalledWith(expect.objectContaining({ id: 'target', banned: false, role: 'editor', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'] }), '/mapas')
    expect(mocks.persistAccess).toHaveBeenCalledWith('target', expect.objectContaining({
      nivelJurIds: [7], recursoIds: ['r7'], hubAccess: expect.objectContaining({ hubDestination: '/mapas' }),
    }))
    expect(mocks.updateUser).toHaveBeenCalled()
    expect(mocks.unban).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: 'target' } }))
  })

  it('rejects unknown sections, external/destination ACL violations, and last-admin removal before mutation', async () => {
    expect((await patch({ hubAccess: { enabledSections: ['future'], landing: false, destination: null } })).status).toBe(400)
    expect((await patch({ hubAccess: { enabledSections: ['maps'], landing: false, destination: 'https://evil.test' } })).status).toBe(400)
    mocks.validate.mockResolvedValue(false)
    expect((await patch({ role: 'editor', hubAccess: { enabledSections: ['maps'], landing: false, destination: '/mapas' } })).status).toBe(400)
    mocks.validate.mockResolvedValue(true); mocks.admins.mockResolvedValue(['target'])
    expect((await patch({ role: 'consulta' })).status).toBe(400)
    expect(mocks.setRole).not.toHaveBeenCalled()
  })

  it('rejects a legacy alias when the selected-resource ACL denies its canonical resource', async () => {
    mocks.validate.mockImplementation(async (settings, acl) => acl(settings.hubDestination ?? '/'))
    mocks.allowed.mockResolvedValue(false)
    const response = await patch({
      accesoRecursos: 'seleccionados', recursoIds: [],
      hubAccess: { enabledSections: ['dashboards'], landing: false, destination: '/tablero' },
    })
    expect(response.status).toBe(400)
    expect(mocks.allowed).toHaveBeenCalledWith(expect.objectContaining({ accesoRecursos: 'seleccionados', recursoIds: [] }), '/tablero')
    expect(mocks.persistAccess).not.toHaveBeenCalled()
  })

  it('accepts role/resource/jurisdiction-only PATCH for a legacy account with unset landing and destination', async () => {
    mocks.getHubUserSession.mockResolvedValue({ ...target, hubPolicy: {}, hubDestination: null })
    const response = await patch({ nivelJurIds: [8], accesoRecursos: 'seleccionados', recursoIds: ['r8'] })
    expect(response.status).toBe(200)
    expect(mocks.validate).toHaveBeenCalledWith({ hubPolicy: {}, hubDestination: null }, expect.any(Function))
    expect(mocks.allowed).toHaveBeenCalledWith(expect.objectContaining({ id: 'target' }), '/')
  })

  it('permits explicit deny-all, keeps GET/list legacy-shaped policies, and returns auth API failures', async () => {
    expect((await patch({ hubAccess: { enabledSections: [], landing: false, destination: null } })).status).toBe(200)
    expect(mocks.persistAccess).toHaveBeenCalledWith('target', expect.objectContaining({
      hubAccess: { hubPolicy: { enabledSections: [], landing: false }, hubDestination: null },
    }))
    mocks.persistAccess.mockRejectedValueOnce(new Error('transaction failed'))
    expect((await patch({ hubAccess: { enabledSections: ['maps'], landing: false, destination: '/mapas' } })).status).toBe(400)
    mocks.updateUser.mockRejectedValueOnce(new Error('provider failure'))
    expect((await patch({ name: 'Updated' })).status).toBe(400)
    expect(mocks.authError).toHaveBeenCalled()
  })
})
