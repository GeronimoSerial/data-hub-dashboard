import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { BookletServiceError } from './inventory'
import {
  grant, listMemberships, revoke, searchUsers,
  type MembershipRecord, type MembershipRepository,
} from './memberships'

type Account = { id: string; name: string; email: string; banned: boolean; emailVerified: boolean }

const state = {
  accounts: new Map<string, Account>(),
  memberships: [] as MembershipRecord[],
  nextId: 1,
}

const repository: MembershipRepository = {
  async getAccountStatus(userId) {
    const account = state.accounts.get(userId)
    return account ? { emailVerified: account.emailVerified, banned: account.banned } : null
  },
  async getActiveMembership(userId, capability) {
    return state.memberships.find((m) => m.userId === userId && m.capability === capability && m.revokedAt === null) ?? null
  },
  async insertMembership(record) {
    // Mirrors the partial unique index: a second active row for the same user and capability is ignored.
    const duplicate = state.memberships.some((m) => m.userId === record.userId && m.capability === record.capability && m.revokedAt === null)
    if (duplicate) return
    const account = state.accounts.get(record.userId)!
    state.memberships.push({
      ...record,
      userName: account.name,
      userEmail: account.email,
      revokedAt: null,
    })
  },
  async listActiveMemberships() {
    return state.memberships.filter((m) => m.revokedAt === null)
  },
  async getMembership(id) {
    return state.memberships.find((m) => m.id === id) ?? null
  },
  async revokeMembership(id, revokedAt) {
    const membership = state.memberships.find((m) => m.id === id && m.revokedAt === null)
    if (!membership) return false
    membership.revokedAt = revokedAt
    return true
  },
  async searchUsers(query, limit) {
    const needle = query.toLowerCase()
    return [...state.accounts.values()]
      .filter((a) => !a.banned && (a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)))
      .slice(0, limit)
      .map((a) => ({ id: a.id, name: a.name, email: a.email }))
  },
}

const admin: SessionUser = {
  id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}
const editor: SessionUser = {
  id: 'editor-1', role: 'editor', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}

function account(id: string, overrides: Partial<Account> = {}): Account {
  return { id, name: `Usuario ${id}`, email: `${id}@example.test`, banned: false, emailVerified: true, ...overrides }
}

async function expectServiceError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(BookletServiceError)
  expect(error).toMatchObject({ code, status })
}

beforeEach(() => {
  state.accounts.clear()
  state.memberships.length = 0
  state.nextId = 1
  state.accounts.set('admin-1', account('admin-1', { name: 'Admin' }))
  state.accounts.set('editor-1', account('editor-1', { name: 'Editor' }))
  state.accounts.set('user-1', account('user-1', { name: 'Ana Pérez', email: 'ana@example.test' }))
  state.accounts.set('user-2', account('user-2', { name: 'Bruno', email: 'bruno@example.test' }))
  state.accounts.set('banned-1', account('banned-1', { name: 'Carla Banned', email: 'carla@example.test', banned: true }))
})

describe('booklet memberships service', () => {
  it('refuses to grant, revoke, list or search for a non-admin actor', async () => {
    await expectServiceError(grant(editor, 'user-1', 'planning', repository), 'forbidden', 403)
    await expectServiceError(listMemberships(editor, repository), 'forbidden', 403)
    await expectServiceError(searchUsers(editor, 'ana', repository), 'forbidden', 403)

    const existing = await grant(admin, 'user-1', 'planning', repository)
    await expectServiceError(revoke(editor, existing.id, repository), 'forbidden', 403)

    expect(state.memberships).toHaveLength(1)
    expect(state.memberships[0].revokedAt).toBeNull()
  })

  it('grants a capability to an existing account and records the session actor as granter', async () => {
    const view = await grant(admin, 'user-1', 'cabecera', repository)

    expect(view).toMatchObject({ userId: 'user-1', userName: 'Ana Pérez', capability: 'cabecera', grantedByUserId: 'admin-1', revokedAt: null })
    expect(state.memberships).toHaveLength(1)
  })

  it('returns the existing active row when the same grant is repeated', async () => {
    const first = await grant(admin, 'user-1', 'supervisor', repository)
    const second = await grant(admin, 'user-1', 'supervisor', repository)

    expect(second.id).toBe(first.id)
    expect(state.memberships.filter((m) => m.revokedAt === null)).toHaveLength(1)
  })

  it('refuses to grant to a missing or banned account', async () => {
    await expectServiceError(grant(admin, 'ghost', 'planning', repository), 'user_not_found', 404)
    await expectServiceError(grant(admin, 'banned-1', 'planning', repository), 'user_banned', 409)
    expect(state.memberships).toHaveLength(0)
  })

  it('revokes an active membership by setting revokedAt and allows a fresh grant afterwards', async () => {
    const granted = await grant(admin, 'user-1', 'planning', repository)
    const revoked = await revoke(admin, granted.id, repository)

    expect(revoked.revokedAt).not.toBeNull()
    expect(state.memberships[0].revokedAt).not.toBeNull()
    expect((await listMemberships(admin, repository)).some((m) => m.id === granted.id)).toBe(false)

    const regranted = await grant(admin, 'user-1', 'planning', repository)
    expect(regranted.id).not.toBe(granted.id)
    expect(regranted.revokedAt).toBeNull()
  })

  it('reports not_found when revoking an unknown or already revoked membership', async () => {
    await expectServiceError(revoke(admin, 'missing', repository), 'membership_not_found', 404)

    const granted = await grant(admin, 'user-2', 'planning', repository)
    await revoke(admin, granted.id, repository)
    await expectServiceError(revoke(admin, granted.id, repository), 'membership_not_found', 404)
  })

  it('lists only active memberships for an admin', async () => {
    const kept = await grant(admin, 'user-1', 'planning', repository)
    const dropped = await grant(admin, 'user-2', 'cabecera', repository)
    await revoke(admin, dropped.id, repository)

    const listed = await listMemberships(admin, repository)
    expect(listed.map((m) => m.id)).toEqual([kept.id])
  })

  it('searches unbanned users by name or email, returning at most 20 and nothing for a blank query', async () => {
    const found = await searchUsers(admin, 'ana', repository)
    expect(found).toEqual([{ id: 'user-1', name: 'Ana Pérez', email: 'ana@example.test' }])

    expect(await searchUsers(admin, 'banned', repository)).toEqual([])
    expect(await searchUsers(admin, '   ', repository)).toEqual([])
  })
})
