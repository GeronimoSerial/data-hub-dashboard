import { describe, expect, it, vi } from 'vitest'
import type { Role, SessionUser } from '@/lib/acl'
import type { MembershipRecord, MembershipRepository } from './memberships'
import { listViewAsCandidates, resolveViewAsActor, type ViewAsRepository } from './view-as'

const admin: SessionUser = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const consulta: SessionUser = { id: 'viewer-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const isAdmin = async (actor: SessionUser | null) => actor?.role === 'admin' && !actor.banned

function accounts(rows: Record<string, { name: string; role: Role | null; banned: boolean }>): ViewAsRepository {
  return {
    findAccount: vi.fn(async (userId: string) => rows[userId] ? { id: userId, ...rows[userId] } : null),
  }
}

const supervisorAccount = { name: 'Supervisora Demo', role: 'consulta' as const, banned: false }

describe('resolveViewAsActor', () => {
  it('lets an admin read as an unbanned supervisor account', async () => {
    const repository = accounts({ 'supervisor-1': supervisorAccount })

    const result = await resolveViewAsActor(admin, 'supervisor-1', repository, isAdmin)

    expect(result).toEqual({
      status: 'viewing',
      actor: { id: 'supervisor-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'seleccionados', recursoIds: [] },
      target: { userId: 'supervisor-1', name: 'Supervisora Demo' },
    })
  })

  it('ignores viewAs from a non-admin and keeps the real actor', async () => {
    const repository = { findAccount: vi.fn() }

    const result = await resolveViewAsActor(consulta, 'supervisor-1', repository, isAdmin)

    expect(result).toEqual({ status: 'self', actor: consulta })
    expect(repository.findAccount).not.toHaveBeenCalled()
  })

  it('keeps the real actor when no viewAs is requested', async () => {
    const repository = { findAccount: vi.fn() }

    expect(await resolveViewAsActor(admin, undefined, repository, isAdmin)).toEqual({ status: 'self', actor: admin })
    expect(await resolveViewAsActor(admin, '', repository, isAdmin)).toEqual({ status: 'self', actor: admin })
    expect(repository.findAccount).not.toHaveBeenCalled()
  })

  it('rejects a banned target account for an admin', async () => {
    const repository = accounts({ 'supervisor-1': { ...supervisorAccount, banned: true } })

    expect(await resolveViewAsActor(admin, 'supervisor-1', repository, isAdmin)).toEqual({ status: 'unavailable' })
  })

  it('rejects an unknown target account for an admin', async () => {
    expect(await resolveViewAsActor(admin, 'missing-1', accounts({}), isAdmin)).toEqual({ status: 'unavailable' })
  })

  it('ignores blank target identifiers and rejects oversized ones for an admin', async () => {
    const repository = { findAccount: vi.fn() }

    expect(await resolveViewAsActor(admin, '   ', repository, isAdmin)).toEqual({ status: 'self', actor: admin })
    expect(await resolveViewAsActor(admin, 'x'.repeat(129), repository, isAdmin)).toEqual({ status: 'unavailable' })
    expect(repository.findAccount).not.toHaveBeenCalled()
  })

  it('treats the admin viewing themselves as a plain self view', async () => {
    const repository = accounts({ 'admin-1': { name: 'Admin', role: 'admin' as const, banned: false } })

    expect(await resolveViewAsActor(admin, 'admin-1', repository, isAdmin)).toEqual({ status: 'self', actor: admin })
  })

  it('never resolves a view for an anonymous or banned actor', async () => {
    const repository = accounts({ 'supervisor-1': supervisorAccount })

    expect(await resolveViewAsActor(null, 'supervisor-1', repository, isAdmin)).toEqual({ status: 'self', actor: null })
    expect(await resolveViewAsActor({ ...admin, banned: true }, 'supervisor-1', repository, isAdmin))
      .toEqual({ status: 'self', actor: { ...admin, banned: true } })
  })
})

const record = (overrides: Partial<MembershipRecord>): MembershipRecord => ({
  id: 'membership-1', userId: 'supervisor-1', userName: 'Supervisora Demo', userEmail: 'sup@example.test',
  capability: 'supervisor', grantedByUserId: 'admin-1', grantedAt: new Date('2026-11-01T00:00:00.000Z'), revokedAt: null,
  ...overrides,
})

function membershipRepository(rows: MembershipRecord[]): MembershipRepository {
  return {
    getAccountStatus: async () => ({ emailVerified: true, banned: false }),
    getActiveMembership: async () => null,
    insertMembership: async () => undefined,
    listActiveMemberships: async () => rows,
    getMembership: async () => null,
    revokeMembership: async () => false,
    searchUsers: async () => [],
  }
}

describe('listViewAsCandidates', () => {
  it('lists active supervisor and cabecera holders once per account', async () => {
    const rows = [
      record({ id: 'm-1', userId: 'supervisor-1', userName: 'Supervisora Demo', capability: 'supervisor' }),
      record({ id: 'm-2', userId: 'supervisor-1', userName: 'Supervisora Demo', capability: 'cabecera' }),
      record({ id: 'm-3', userId: 'planner-1', userName: 'Planificador', capability: 'planning' }),
    ]

    const candidates = await listViewAsCandidates(admin, membershipRepository(rows))

    expect(candidates).toEqual([
      { userId: 'supervisor-1', name: 'Supervisora Demo', email: 'sup@example.test', capabilities: ['supervisor', 'cabecera'] },
    ])
  })

  it('refuses to list candidates for a non-admin', async () => {
    await expect(listViewAsCandidates(consulta, membershipRepository([record({})]))).rejects.toMatchObject({ status: 403 })
  })
})
