import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { approvalRepository, approveRequest, rejectRequest, type ApprovalRepository } from './approvals'

type StoredRequest = {
  requestId: string; campaignId: string; recipientCueAnexo: string; cabeceraCueAnexo: string; rootRequestId: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'; createdByUserId: string
  lines: Array<{ productId: string; quantity: number; approvedQuantity: number }>
}
const state = {
  accounts: new Map<string, { emailVerified: boolean; banned: boolean }>(),
  memberships: new Set<string>(),
  assigned: true,
  eligible: true,
  requests: new Map<string, StoredRequest>(),
  stock: new Map<string, number>(), quotas: new Map<string, number>(),
  idempotency: new Map<string, { payloadHash: string; response: unknown }>(), movements: [] as unknown[],
  signatures: [] as unknown[], authorityReady: true, lockOrder: [] as string[],
  failAfterFirstDebit: false, stockWasDebited: false,
}
const rowKey = (campaignId: string, productId: string, cue?: string) => [campaignId, productId, cue].filter(Boolean).join(':')
const repository: ApprovalRepository = {
  async lockEligibilitySources() { state.lockOrder.push('eligibility-sources') },
  async transaction(operation) {
    const backup = {
      requests: structuredClone(state.requests), stock: new Map(state.stock), quotas: new Map(state.quotas),
      idempotency: structuredClone(state.idempotency), movements: structuredClone(state.movements), signatures: structuredClone(state.signatures),
    }
    try { return await operation(repository) } catch (error) {
      state.requests.clear(); for (const [key, value] of backup.requests) state.requests.set(key, value)
      state.stock.clear(); for (const [key, value] of backup.stock) state.stock.set(key, value)
      state.quotas.clear(); for (const [key, value] of backup.quotas) state.quotas.set(key, value)
      state.idempotency.clear(); for (const [key, value] of backup.idempotency) state.idempotency.set(key, value)
      state.movements.splice(0, state.movements.length, ...backup.movements)
      state.signatures.splice(0, state.signatures.length, ...backup.signatures)
      throw error
    }
  },
  async getAccountStatus(id) { return state.accounts.get(id) ?? null },
  async hasActiveMembership(id, capability) { return state.memberships.has(`${id}:${capability}`) },
  async hasSchoolAssignment(_id, cue, capability) { return capability === 'supervisor' && cue === '180123456' && state.assigned },
  async getCampaign() { return { status: 'active', distributionEnabled: true, overassignmentAllowed: false } },
  async lockRequest() { state.lockOrder.push('request') },
  async lockChain() { state.lockOrder.push('chain') },
  async lockProduct(_campaign, productId) { state.lockOrder.push(`product:${productId}`) },
  async lockQuota(_campaign, _cue, productId) { state.lockOrder.push(`quota:${productId}`) },
  async lockIdempotency() { state.lockOrder.push('idempotency') },
  async getRequest(id) { return state.requests.get(id) ?? null },
  async listChain(rootRequestId) { return [...state.requests.values()].filter((row) => row.rootRequestId === rootRequestId) },
  async getCurrentEligibility() { return { eligible: state.eligible, severity: state.eligible ? 'Crítica' : 'Alta', evaluatedAt: '2026-11-09T12:00:00.000Z' } },
  async getStock(campaignId, productId) { return state.stock.get(rowKey(campaignId, productId)) ?? 0 },
  async getQuota(campaignId, productId, cue) { return state.quotas.get(rowKey(campaignId, productId, cue)) ?? 0 },
  async debitStock(campaignId, productId, quantity) {
    const key = rowKey(campaignId, productId), stock = state.stock.get(key) ?? 0
    if (stock < quantity) return false
    state.stock.set(key, stock - quantity); state.stockWasDebited = true; return true
  },
  async debitQuota(campaignId, productId, cue, quantity) {
    if (state.failAfterFirstDebit && state.stockWasDebited) throw new Error('injected failure after stock debit')
    const key = rowKey(campaignId, productId, cue), quota = state.quotas.get(key) ?? 0
    if (quota < quantity) return false
    state.quotas.set(key, quota - quantity); return true
  },
  async productExists(productId) { return productId === 'product-1' || productId === 'product-2' },
  async isAssignedSupervisor(id, cue) { return id === 'supervisor-1' && cue === '180123456' && state.assigned },
  async approvalAuthorityReady() { return state.authorityReady },
  async getIdempotency(actorId, operation, key) { return state.idempotency.get(`${actorId}:${operation}:${key}`) ?? null },
  async saveIdempotency(actorId, operation, key, record) { state.idempotency.set(`${actorId}:${operation}:${key}`, record) },
  async recordMovement(movement) {
    state.movements.push(movement)
    if (state.failAfterFirstDebit && state.movements.length === 1) throw new Error('injected failure')
  },
  async saveApproval(requestId, actorId, approvedAt, lines) {
    const previous = state.requests.get(requestId)!
    const approved = new Map(lines.map((line) => [line.productId, line.quantity]))
    state.requests.set(requestId, { ...previous, status: 'approved', lines: previous.lines.map((line) => ({ ...line, approvedQuantity: approved.get(line.productId) ?? 0 })) })
    state.signatures.push({ requestId, actorId, approvedAt })
  },
  async saveRejection(requestId, actorId, rejectedAt, reason) {
    const previous = state.requests.get(requestId)!
    state.requests.set(requestId, { ...previous, status: 'rejected' })
    state.signatures.push({ requestId, actorId, rejectedAt, reason })
  },
  async saveRemainder(request, lines, idempotencyKey, record) {
    state.requests.set(request.requestId, { ...request, lines: lines.map((line) => ({ ...line, approvedQuantity: 0 })) })
    state.idempotency.set(`${request.createdByUserId}:request.remainder:${idempotencyKey}`, record)
  },
}
const supervisor: SessionUser = { id: 'supervisor-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const approval = (overrides: Record<string, unknown> = {}) => ({ requestId: 'request-1', lines: [{ productId: 'product-1', quantity: 60 }], idempotencyKey: 'approval-1', ...overrides })

beforeEach(() => {
  state.accounts.clear(); state.memberships.clear(); state.requests.clear(); state.stock.clear(); state.quotas.clear()
  state.idempotency.clear(); state.movements.length = 0; state.signatures.length = 0; state.lockOrder.length = 0
  state.assigned = true; state.eligible = true; state.failAfterFirstDebit = false; state.stockWasDebited = false; state.authorityReady = true
  state.accounts.set(supervisor.id, { emailVerified: true, banned: false }); state.memberships.add(`${supervisor.id}:supervisor`)
  state.requests.set('request-1', {
    requestId: 'request-1', campaignId: 'campaign-1', recipientCueAnexo: '180123457', cabeceraCueAnexo: '180123456',
    rootRequestId: 'request-1', status: 'pending', createdByUserId: 'cabecera-1',
    lines: [{ productId: 'product-1', quantity: 100, approvedQuantity: 0 }],
  })
  state.stock.set('campaign-1:product-1', 80); state.quotas.set('campaign-1:product-1:180123456', 60)
})

describe('approveRequest', () => {
  it('keeps production approvals disabled until assignment provenance is trusted', async () => {
    await expect(approvalRepository.approvalAuthorityReady('180123456', '180123456')).resolves.toBe(false)
  })

  it('does not change balances when transaction-bound authority is unavailable', async () => {
    state.authorityReady = false
    await expect(approveRequest(supervisor, approval(), repository)).rejects.toMatchObject({ code: 'authority_unavailable' })
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBe(60)
    expect(state.signatures).toHaveLength(0)
  })

  it('approves a partial line within both balances and records only the remaining global gap', async () => {
    const result = await approveRequest(supervisor, approval(), repository)
    expect(result).toMatchObject({ status: 'approved', approved: [{ productId: 'product-1', quantity: 60 }], remaining: [{ productId: 'product-1', quantity: 40 }] })
    expect(state.stock.get('campaign-1:product-1')).toBe(20)
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBe(0)
    expect(state.signatures).toHaveLength(1)
    expect(state.movements).toHaveLength(1)
  })

  it('rejects approval above available stock or quota without changing balances', async () => {
    await expect(approveRequest(supervisor, approval({ lines: [{ productId: 'product-1', quantity: 61 }] }), repository)).rejects.toMatchObject({ code: 'insufficient_availability' })
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBe(60)
    expect(state.signatures).toHaveLength(0)
  })

  it('validates every product before debiting any balance', async () => {
    await expect(approveRequest(supervisor, approval({ lines: [
      { productId: 'product-1', quantity: 5 }, { productId: 'not-a-product', quantity: 1 },
    ] }), repository)).rejects.toMatchObject({ code: 'product_not_found' })
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.movements).toHaveLength(0)
  })

  it('locks the request and chain before products in stable sorted order, then quota rows', async () => {
    const request = state.requests.get('request-1')!
    request.lines.push({ productId: 'product-2', quantity: 10, approvedQuantity: 0 })
    state.stock.set('campaign-1:product-2', 20)
    state.quotas.set('campaign-1:product-2:180123456', 20)
    await approveRequest(supervisor, approval({ lines: [
      { productId: 'product-2', quantity: 5 }, { productId: 'product-1', quantity: 5 },
    ] }), repository)
    expect(state.lockOrder).toEqual([
      'eligibility-sources', 'request', 'chain', 'idempotency', 'product:product-1', 'product:product-2', 'quota:product-1', 'quota:product-2',
    ])
  })

  it('replays an identical key, rejects conflicting payload and never approves twice', async () => {
    const first = await approveRequest(supervisor, approval(), repository)
    expect(await approveRequest(supervisor, approval(), repository)).toEqual(first)
    await expect(approveRequest(supervisor, approval({ lines: [{ productId: 'product-1', quantity: 59 }] }), repository)).rejects.toMatchObject({ code: 'idempotency_conflict' })
    await expect(approveRequest(supervisor, approval({ idempotencyKey: 'another-key' }), repository)).rejects.toMatchObject({ code: 'request_not_pending' })
    expect(state.movements).toHaveLength(1)
    expect(state.signatures).toHaveLength(1)
  })

  it('blocks approval if eligibility, assignment, or account validity changed', async () => {
    for (const [mutate, code] of [
      [() => { state.eligible = false }, 'authority_changed'],
      [() => { state.assigned = false }, 'forbidden'],
      [() => { state.accounts.set(supervisor.id, { emailVerified: true, banned: true }) }, 'forbidden'],
    ] as const) {
      mutate()
      await expect(approveRequest(supervisor, approval(), repository)).rejects.toMatchObject({ code })
      expect(state.stock.get('campaign-1:product-1')).toBe(80)
      expect(state.signatures).toHaveLength(0)
      state.eligible = true; state.assigned = true; state.accounts.set(supervisor.id, { emailVerified: true, banned: false })
    }
  })

  it('denies a verified supervisor account without the request assignment', async () => {
    const outsider = { ...supervisor, id: 'supervisor-outsider' }
    state.accounts.set(outsider.id, { emailVerified: true, banned: false })
    state.memberships.add(`${outsider.id}:supervisor`)
    await expect(approveRequest(outsider, approval(), repository)).rejects.toMatchObject({ code: 'forbidden' })
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.signatures).toHaveLength(0)
  })

  it('rolls back all balances and signature when a later write fails', async () => {
    state.failAfterFirstDebit = true
    await expect(approveRequest(supervisor, approval(), repository)).rejects.toThrow('injected failure after stock debit')
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBe(60)
    expect(state.signatures).toHaveLength(0)
  })
})

describe('rejectRequest', () => {
  it('closes a pending request without decrementing stock or allowing reopening', async () => {
    const result = await rejectRequest(supervisor, { requestId: 'request-1', idempotencyKey: 'reject-1', reason: 'Not approved' }, repository)
    expect(result.status).toBe('rejected')
    expect(state.stock.get('campaign-1:product-1')).toBe(80)
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBe(60)
    await expect(approveRequest(supervisor, approval({ idempotencyKey: 'later' }), repository)).rejects.toMatchObject({ code: 'request_not_pending' })
  })
})

describe('admin write authority', () => {
  const admin: SessionUser = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  beforeEach(() => {
    state.accounts.set(admin.id, { emailVerified: true, banned: false })
    state.assigned = false
  })

  it('approves without supervisor membership, assignment, or ready authority, signed by the session admin', async () => {
    state.authorityReady = false
    const result = await approveRequest(admin, approval(), repository)
    expect(result.status).toBe('approved')
    expect(state.signatures).toEqual([expect.objectContaining({ requestId: 'request-1', actorId: admin.id })])
  })

  it('rejects without membership or assignment, signed by the session admin', async () => {
    const result = await rejectRequest(admin, { requestId: 'request-1', idempotencyKey: 'reject-admin-1', reason: 'Motivo' }, repository)
    expect(result.status).toBe('rejected')
    expect(state.signatures).toEqual([expect.objectContaining({ actorId: admin.id, reason: 'Motivo' })])
  })

  it('keeps the eligibility check for an admin approval', async () => {
    state.eligible = false
    await expect(approveRequest(admin, approval(), repository)).rejects.toMatchObject({ code: 'authority_changed', status: 409 })
    expect(state.signatures).toHaveLength(0)
  })

  it('approves for an unverified admin account, signed by the session admin', async () => {
    state.accounts.set('admin-unverified', { emailVerified: false, banned: false })
    const unverified: SessionUser = { ...admin, id: 'admin-unverified' }
    const approved = await approveRequest(unverified, approval({ idempotencyKey: 'unverified-approve' }), repository)
    expect(approved.status).toBe('approved')
    expect(state.signatures).toEqual([expect.objectContaining({ requestId: 'request-1', actorId: 'admin-unverified' })])
  })

  it('denies banned admins and unverified non-admin accounts without membership', async () => {
    state.accounts.set('admin-banned', { emailVerified: true, banned: true })
    state.accounts.set('outsider', { emailVerified: true, banned: false })
    const outsider: SessionUser = { ...admin, id: 'outsider', role: 'consulta' }
    await expect(approveRequest({ ...admin, id: 'admin-banned' }, approval(), repository)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    await expect(approveRequest(outsider, approval(), repository)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(state.signatures).toHaveLength(0)
  })
})
