import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { createRemainderRequest, getRequestChain, type RemainderRepository } from './remainders'

type ChainRow = {
  requestId: string; parentRequestId: string | null; rootRequestId: string; campaignId: string
  recipientCueAnexo: string; cabeceraCueAnexo: string; status: 'pending' | 'approved' | 'rejected' | 'draft'
  createdByUserId: string; lines: Array<{ productId: string; quantity: number; approvedQuantity: number }>
}
const state = {
  accounts: new Map<string, { emailVerified: boolean; banned: boolean }>(),
  memberships: new Set<string>(), assigned: true, eligible: true,
  assignedCues: new Set<string>(),
  requests: new Map<string, ChainRow>(), quotas: new Map<string, number>(), stock: new Map<string, number>(),
  idempotency: new Map<string, { payloadHash: string; response: unknown }>(),
  sequence: 1,
}
let transactionTail = Promise.resolve()
const preparedProjection = Symbol('prepared-ge-projection') as never
const repository: RemainderRepository = {
  async transaction(operation) {
    const run = transactionTail.then(() => operation(repository))
    transactionTail = run.then(() => undefined, () => undefined)
    return run
  },
  async getAccountStatus(id) { return state.accounts.get(id) ?? null },
  async hasActiveMembership(id, capability) { return state.memberships.has(`${id}:${capability}`) },
  async hasSchoolAssignment(id, cue, capability) { return capability === 'cabecera' && state.assignedCues.has(cue) && id === 'cabecera-1' && state.assigned },
  async lockRequest() {}, async lockChain() {}, async lockIdempotency() {},
  async getCampaign() { return { status: 'active', distributionEnabled: true, overassignmentAllowed: false } },
  async getRequest(id) { return state.requests.get(id) ?? null },
  async listChain(rootId) { return [...state.requests.values()].filter((row) => row.rootRequestId === rootId) },
  // Mirrors the live adapter: without the prepared GE projection, eligibility fails closed.
  async prepareCurrentEligibilityProjection() { return preparedProjection },
  async getCurrentEligibility(_cue, geSchema) {
    const eligible = state.eligible && geSchema === preparedProjection
    return { eligible, severity: eligible ? 'Crítica' : 'Alta', evaluatedAt: '2026-11-09T12:00:00.000Z' }
  },
  async productExists(id) { return id === 'product-1' },
  async getIdempotency(actorId, _operation, key) { return state.idempotency.get(`${actorId}:${key}`) ?? null },
  async saveIdempotency(actorId, _operation, key, record) { state.idempotency.set(`${actorId}:${key}`, record) },
  async approvalAuthorityReady() { return true },
  async saveRemainder(row, lines, key, record) {
    state.requests.set(row.requestId, { ...row, lines: lines.map((line) => ({ ...line, approvedQuantity: 0 })) })
    state.idempotency.set(`${row.createdByUserId}:${key}`, record)
  },
}
const cabecera: SessionUser = { id: 'cabecera-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const root: ChainRow = {
  requestId: 'root-1', parentRequestId: null, rootRequestId: 'root-1', campaignId: 'campaign-1',
  recipientCueAnexo: '180123457', cabeceraCueAnexo: '180123456', status: 'approved', createdByUserId: cabecera.id,
  lines: [{ productId: 'product-1', quantity: 100, approvedQuantity: 60 }],
}

beforeEach(() => {
  transactionTail = Promise.resolve()
  state.accounts.clear(); state.memberships.clear(); state.requests.clear(); state.quotas.clear(); state.stock.clear(); state.idempotency.clear(); state.sequence = 1
  state.accounts.set(cabecera.id, { emailVerified: true, banned: false }); state.memberships.add(`${cabecera.id}:cabecera`)
  state.assignedCues.clear(); state.assignedCues.add('180123456'); state.assignedCues.add('180123457')
  state.quotas.set('campaign-1:product-1:180123456', 100); state.stock.set('campaign-1:product-1', 100); state.assigned = true; state.eligible = true
  state.requests.set(root.requestId, structuredClone(root))
})

describe('request remainder chains', () => {
  it('computes one global gap from all approvals rather than summing per-request gaps', async () => {
    state.requests.set('child-1', {
      ...root, requestId: 'child-1', parentRequestId: root.requestId, status: 'approved',
      lines: [{ productId: 'product-1', quantity: 40, approvedQuantity: 25 }],
    })
    await expect(getRequestChain(cabecera, root.requestId, repository)).resolves.toMatchObject({
      rootRequestId: root.requestId,
      requested: [{ productId: 'product-1', quantity: 100 }],
      approved: [{ productId: 'product-1', quantity: 85 }],
      remaining: [{ productId: 'product-1', quantity: 15 }],
    })
  })

  it('returns the approved root and available remainder only to its assigned cabecera account', async () => {
    const result = await getRequestChain(cabecera, root.requestId, repository)
    expect(result).toMatchObject({
      rootRequestId: root.requestId,
      requested: [{ productId: 'product-1', quantity: 100 }],
      availableRemainder: [{ productId: 'product-1', quantity: 40 }],
    })
  })

  it('does not reveal a guessed out-of-scope root or blocked account', async () => {
    const stranger: SessionUser = { ...cabecera, id: 'stranger' }
    state.accounts.set(stranger.id, { emailVerified: true, banned: false })
    await expect(getRequestChain(stranger, root.requestId, repository)).rejects.toMatchObject({ code: 'request_not_found', status: 404 })

    state.accounts.set(cabecera.id, { emailVerified: true, banned: true })
    await expect(getRequestChain(cabecera, root.requestId, repository)).rejects.toMatchObject({ code: 'request_not_found', status: 404 })
  })

  it('does not reveal a chain when the cabecera lacks the recipient assignment', async () => {
    state.assignedCues.delete(root.recipientCueAnexo)
    await expect(getRequestChain(cabecera, root.requestId, repository)).rejects.toMatchObject({ code: 'request_not_found', status: 404 })
  })

  it('does not expose an actionable remainder for a root that is not approved', async () => {
    state.requests.set(root.requestId, { ...root, status: 'pending' })
    await expect(getRequestChain(cabecera, root.requestId, repository)).rejects.toMatchObject({ code: 'request_not_found', status: 404 })
  })

  it('resolves a child request ID to its authorized root chain', async () => {
    state.requests.set('child-1', {
      ...root, requestId: 'child-1', parentRequestId: root.requestId, status: 'pending',
      lines: [{ productId: 'product-1', quantity: 20, approvedQuantity: 0 }],
    })
    await expect(getRequestChain(cabecera, 'child-1', repository)).resolves.toMatchObject({
      rootRequestId: root.requestId,
      availableRemainder: [{ productId: 'product-1', quantity: 20 }],
    })
  })

  it('reserves a pending remainder transactionally to prevent duplicate children', async () => {
    const input = { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 40 }], idempotencyKey: 'rem-1' }
    const first = await createRemainderRequest(cabecera, input, repository)
    expect(first.status).toBe('pending')
    expect(first.recommendations).toEqual([{ productId: 'product-1', students: null, suggested: 40, sourceCutId: null }])
    await expect(createRemainderRequest(cabecera, { ...input, idempotencyKey: 'rem-2' }, repository)).rejects.toMatchObject({ code: 'remainder_exceeded' })
    expect(state.requests.size).toBe(2)
  })

  it('does not oversubscribe a chain when two child requests race', async () => {
    const outcomes = await Promise.allSettled([
      createRemainderRequest(cabecera, { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 25 }], idempotencyKey: 'parallel-a' }, repository),
      createRemainderRequest(cabecera, { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 25 }], idempotencyKey: 'parallel-b' }, repository),
    ])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(state.requests.size).toBe(2)
  })

  it('releases rejected child quantities and does not reopen a rejected chain', async () => {
    state.requests.set('child-rejected', {
      ...root, requestId: 'child-rejected', parentRequestId: root.requestId, status: 'rejected',
      lines: [{ productId: 'product-1', quantity: 40, approvedQuantity: 0 }],
    })
    await expect(createRemainderRequest(cabecera, { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 40 }], idempotencyKey: 'rem-new' }, repository)).resolves.toMatchObject({ status: 'pending' })
    state.requests.set(root.requestId, { ...root, status: 'rejected' })
    await expect(createRemainderRequest(cabecera, { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 1 }], idempotencyKey: 'rem-invalid' }, repository)).rejects.toMatchObject({ code: 'request_not_remainder_eligible' })
  })

  it('does not allow a child when the chain is fully covered', async () => {
    state.requests.set(root.requestId, { ...root, lines: [{ productId: 'product-1', quantity: 60, approvedQuantity: 60 }] })
    await expect(createRemainderRequest(cabecera, { rootRequestId: root.requestId, lines: [{ productId: 'product-1', quantity: 1 }], idempotencyKey: 'rem-covered' }, repository)).rejects.toMatchObject({ code: 'remainder_exceeded' })
  })
})
