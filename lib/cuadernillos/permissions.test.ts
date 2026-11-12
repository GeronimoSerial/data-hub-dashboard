import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import {
  canAccessRequest,
  canAccessSchool,
  hasBookletCapability,
  getBookletRequestPage,
  isBookletAdmin,
  type BookletRequestReadRepository,
  type BookletRequestReadCandidate,
  type BookletRequestPermissionRepository,
  type BookletPermissionRepository,
} from './permissions'

type Account = { emailVerified: boolean; banned: boolean }

const accountStore = {
  accounts: new Map<string, Account>(),
  memberships: new Set<string>(),
  assignments: new Set<string>(),
}

const repository: BookletPermissionRepository = {
  getAccountStatus: async (userId) => accountStore.accounts.get(userId) ?? null,
  hasActiveMembership: async (userId, capability) => accountStore.memberships.has(`${userId}:${capability}`),
  hasSchoolAssignment: async (userId, cueAnexo, capability) => accountStore.assignments.has(`${userId}:${cueAnexo}:${capability}`),
}

const actor = (id: string, banned = false, role: SessionUser['role'] = 'admin'): SessionUser => ({
  id,
  role,
  banned,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
})

beforeEach(() => {
  accountStore.accounts.clear()
  accountStore.memberships.clear()
  accountStore.assignments.clear()
})

describe('booklet permissions', () => {
  it('grants every module capability to a verified admin without membership and denies non-admins', async () => {
    accountStore.accounts.set('user-1', { emailVerified: true, banned: false })
    accountStore.accounts.set('consulta-1', { emailVerified: true, banned: false })

    await expect(hasBookletCapability(actor('user-1'), 'planning', repository)).resolves.toBe(true)
    await expect(hasBookletCapability(actor('user-1'), 'supervisor', repository)).resolves.toBe(true)
    await expect(hasBookletCapability(actor('consulta-1', false, 'consulta'), 'planning', repository)).resolves.toBe(false)
  })

  it('denies banned and unverified accounts despite stored membership', async () => {
    accountStore.accounts.set('banned', { emailVerified: true, banned: true })
    accountStore.accounts.set('unverified', { emailVerified: false, banned: false })
    accountStore.memberships.add('banned:planning')
    accountStore.memberships.add('unverified:planning')

    await expect(hasBookletCapability(actor('banned'), 'planning', repository)).resolves.toBe(false)
    await expect(hasBookletCapability(actor('unverified', false, 'consulta'), 'planning', repository)).resolves.toBe(false)
  })

  it('keeps persisted membership after relogin but requires the exact school assignment', async () => {
    accountStore.accounts.set('cabecera-user', { emailVerified: true, banned: false })
    accountStore.memberships.add('cabecera-user:cabecera')
    accountStore.assignments.add('cabecera-user:180123456:cabecera')

    await expect(hasBookletCapability(actor('cabecera-user', true), 'cabecera', repository)).resolves.toBe(false)
    await expect(hasBookletCapability(actor('cabecera-user', false, 'consulta'), 'cabecera', repository)).resolves.toBe(true)
    await expect(canAccessSchool(actor('cabecera-user', false, 'consulta'), '180123456', 'cabecera', repository)).resolves.toBe(true)
    await expect(canAccessSchool(actor('cabecera-user', false, 'consulta'), '180123457', 'cabecera', repository)).resolves.toBe(false)
  })

  it('denies a supervisor with a membership but no matching responsibility', async () => {
    accountStore.accounts.set('supervisor-user', { emailVerified: true, banned: false })
    accountStore.memberships.add('supervisor-user:supervisor')
    accountStore.assignments.add('another-user:180123456:supervisor')

    await expect(canAccessSchool(actor('supervisor-user', false, 'consulta'), '180123456', 'supervisor', repository)).resolves.toBe(false)
  })

  it('uses request scope from an internal reader before checking the assigned account', async () => {
    accountStore.accounts.set('cabecera-user', { emailVerified: true, banned: false })
    accountStore.memberships.add('cabecera-user:cabecera')
    accountStore.assignments.add('cabecera-user:180123456:cabecera')
    const requestRepository: BookletRequestPermissionRepository = {
      ...repository,
      getRequestSchoolScope: async (requestId) => requestId === 'request-1'
        ? { recipientCueAnexo: '180123457', cabeceraCueAnexo: '180123456' }
        : null,
    }

    await expect(canAccessRequest(actor('cabecera-user'), 'request-1', 'cabecera', requestRepository)).resolves.toBe(true)
    await expect(canAccessRequest(actor('cabecera-user'), 'missing-request', 'cabecera', requestRepository)).resolves.toBe(false)
  })
})

const activeCampaign = { id: 'campaign-1', name: 'Campaign one', distributionEnabled: true, overassignmentAllowed: false }
const candidate = (requestId: string, createdAt: string, recipientCueAnexo = '180123457'): BookletRequestReadCandidate => ({
  requestId, rootRequestId: requestId, recipientCueAnexo, recipientName: 'Recipient', cabeceraCueAnexo: '180123456', cabeceraName: 'Head',
  status: 'pending', submittedAt: createdAt, approvedAt: null, approvalIdentity: null, requested: [], approved: [], remaining: [], createdAt,
})

const readRepository = (overrides: Partial<BookletRequestReadRepository> = {}): BookletRequestReadRepository => {
  const rows = [candidate('request-3', '2026-11-09T03:00:00.000Z'), candidate('request-2', '2026-11-09T02:00:00.000Z'), candidate('request-1', '2026-11-09T01:00:00.000Z')]
  return {
    getAccountStatus: async (id) => accountStore.accounts.get(id) ?? null,
    hasActiveMembership: async (id, capability) => accountStore.memberships.has(`${id}:${capability}`),
    hasSchoolAssignment: async (id, cue, capability) => accountStore.assignments.has(`${id}:${cue}:${capability}`),
    getRequestSchoolScope: async (id) => id.startsWith('request-') ? { recipientCueAnexo: '180123457', cabeceraCueAnexo: '180123456' } : null,
    listActiveCampaigns: async () => [activeCampaign],
    listAssignedCues: async () => ['180123457'],
    listRequestCandidates: async ({ after, limit }) => {
      const ordered = rows.filter((row) => !after || row.createdAt < after.createdAt || (row.createdAt === after.createdAt && row.requestId < after.requestId))
      return ordered.slice(0, limit)
    },
    ...overrides,
  }
}

describe('scoped booklet request pages', () => {
  beforeEach(() => {
    accountStore.accounts.clear(); accountStore.memberships.clear(); accountStore.assignments.clear()
  })

  it('requires a verified account with an active module membership before reading campaigns', async () => {
    accountStore.accounts.set('banned-user', { emailVerified: true, banned: true })
    const repo = readRepository({ listActiveCampaigns: async () => { throw new Error('must not read') } })
    await expect(getBookletRequestPage(actor('banned-user'), {}, repo)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })

  it('returns active campaign options without request rows when selection is ambiguous', async () => {
    accountStore.accounts.set('planner', { emailVerified: true, banned: false })
    accountStore.memberships.add('planner:planning')
    const listRequestCandidates = vi.fn(async () => [])
    const result = await getBookletRequestPage(actor('planner'), {}, readRepository({
      listActiveCampaigns: async () => [activeCampaign, { ...activeCampaign, id: 'campaign-2', name: 'Campaign two' }],
      listRequestCandidates,
    }))
    expect(result).toMatchObject({ campaignId: null, requests: [], hasMore: false, nextCursor: null })
    expect(result.campaignOptions).toHaveLength(2)
    expect(listRequestCandidates).not.toHaveBeenCalled()
  })

  it('enforces the current supervisor assignment per candidate row', async () => {
    accountStore.accounts.set('supervisor-user', { emailVerified: true, banned: false })
    accountStore.memberships.add('supervisor-user:supervisor')
    const assigned = candidate('request-in-scope', '2026-11-09T02:00:00.000Z', '180123457')
    const outsider = candidate('request-out-of-scope', '2026-11-09T01:00:00.000Z', '180123458')
    const repo = readRepository({
      listAssignedCues: async () => ['180123457'],
      listRequestCandidates: async () => [assigned, outsider],
      getRequestSchoolScope: async (id) => id === assigned.requestId
        ? { recipientCueAnexo: '180123457', cabeceraCueAnexo: '180123456' }
        : { recipientCueAnexo: '180123458', cabeceraCueAnexo: '180123456' },
      hasSchoolAssignment: async (_id, cue, capability) => capability === 'supervisor' && cue === '180123457',
    })
    const result = await getBookletRequestPage(actor('supervisor-user', false, 'consulta'), {}, repo)
    expect(result.requests.map((request) => request.requestId)).toEqual(['request-in-scope'])
    expect(JSON.stringify(result)).not.toContain('request-out-of-scope')
  })

  it('paginates by stable created-at and ID cursors without repeating rows', async () => {
    accountStore.accounts.set('planner', { emailVerified: true, banned: false })
    accountStore.memberships.add('planner:planning')
    const repo = readRepository()
    const first = await getBookletRequestPage(actor('planner'), { limit: 2 }, repo)
    expect(first.requests.map((request) => request.requestId)).toEqual(['request-3', 'request-2'])
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toEqual(expect.any(String))
    const second = await getBookletRequestPage(actor('planner'), { limit: 2, cursor: first.nextCursor! }, repo)
    expect(second.requests.map((request) => request.requestId)).toEqual(['request-1'])
    expect(second.hasMore).toBe(false)
    expect(second.requests).not.toEqual(expect.arrayContaining(first.requests))
  })

  it('returns 404 for a requested campaign that is not active', async () => {
    accountStore.accounts.set('planner', { emailVerified: true, banned: false })
    accountStore.memberships.add('planner:planning')
    await expect(getBookletRequestPage(actor('planner'), { campaignId: 'inactive' }, readRepository()))
      .rejects.toMatchObject({ code: 'campaign_not_found', status: 404 })
  })
})

describe('booklet admin read-only viewer', () => {
  beforeEach(() => {
    accountStore.accounts.clear(); accountStore.memberships.clear(); accountStore.assignments.clear()
    accountStore.accounts.set('admin-1', { emailVerified: true, banned: false })
  })

  it('recognizes only a verified, unbanned admin account as a read-only viewer', async () => {
    accountStore.accounts.set('admin-banned', { emailVerified: true, banned: true })
    accountStore.accounts.set('admin-unverified', { emailVerified: false, banned: false })

    await expect(isBookletAdmin(actor('admin-1'), repository)).resolves.toBe(true)
    await expect(isBookletAdmin(actor('admin-banned'), repository)).resolves.toBe(false)
    await expect(isBookletAdmin(actor('admin-unverified'), repository)).resolves.toBe(true)
    await expect(isBookletAdmin(actor('admin-1', true), repository)).resolves.toBe(false)
    await expect(isBookletAdmin(actor('admin-1', false, 'consulta'), repository)).resolves.toBe(false)
    await expect(isBookletAdmin(null, repository)).resolves.toBe(false)
  })

  it('grants school authority to a verified admin and never to a banned or non-admin account', async () => {
    await expect(canAccessSchool(actor('admin-1'), '180123456', 'cabecera', repository)).resolves.toBe(true)
    await expect(canAccessSchool(actor('admin-1'), '180123456', 'supervisor', repository)).resolves.toBe(true)
    await expect(canAccessSchool(actor('admin-1', true), '180123456', 'cabecera', repository)).resolves.toBe(false)
    accountStore.accounts.set('consulta-1', { emailVerified: true, banned: false })
    await expect(canAccessSchool(actor('consulta-1', false, 'consulta'), '180123456', 'cabecera', repository)).resolves.toBe(false)
  })

  it('lets a verified admin read requests across every cabecera without membership', async () => {
    const other = { ...candidate('request-other-head', '2026-11-09T02:00:00.000Z'), cabeceraCueAnexo: '180123999' }
    const repo = readRepository({
      listRequestCandidates: async () => [candidate('request-own-head', '2026-11-09T03:00:00.000Z'), other],
    })

    const result = await getBookletRequestPage(actor('admin-1'), {}, repo)

    expect(result.requests.map((request) => request.requestId)).toEqual(['request-own-head', 'request-other-head'])
  })

  it('denies banned admins even though their role is admin', async () => {
    accountStore.accounts.set('admin-banned', { emailVerified: true, banned: true })
    const listRequestCandidates = vi.fn(async () => [candidate('request-1', '2026-11-09T01:00:00.000Z')])

    await expect(getBookletRequestPage(actor('admin-banned'), {}, readRepository({ listRequestCandidates })))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(listRequestCandidates).not.toHaveBeenCalled()
  })

  it('lets an unverified admin account read, plan and grant school authority', async () => {
    accountStore.accounts.set('admin-unverified', { emailVerified: false, banned: false })
    const listRequestCandidates = vi.fn(async () => [candidate('request-1', '2026-11-09T01:00:00.000Z')])

    await expect(hasBookletCapability(actor('admin-unverified'), 'planning', repository)).resolves.toBe(true)
    await expect(canAccessSchool(actor('admin-unverified'), '180123456', 'cabecera', repository)).resolves.toBe(true)
    const page = await getBookletRequestPage(actor('admin-unverified'), {}, readRepository({ listRequestCandidates }))
    expect(page.requests.map((request) => request.requestId)).toEqual(['request-1'])
  })

  it('keeps an unverified non-admin account denied even with a membership', async () => {
    accountStore.accounts.set('unverified-consulta', { emailVerified: false, banned: false })
    accountStore.memberships.add('unverified-consulta:planning')

    await expect(hasBookletCapability(actor('unverified-consulta', false, 'consulta'), 'planning', repository)).resolves.toBe(false)
  })

  it('keeps a non-admin account without membership denied from request reads', async () => {
    accountStore.accounts.set('consulta-1', { emailVerified: true, banned: false })

    await expect(getBookletRequestPage(actor('consulta-1', false, 'consulta'), {}, readRepository()))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })
})
