import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { createRequest, type RequestRepository } from './requests'
import type { Eligibility } from './types'

const state = {
  accounts: new Map<string, { emailVerified: boolean; banned: boolean }>(),
  memberships: new Set<string>(),
  assignments: new Map<string, { cueAnexo: string; relationship: 'cabecera' | 'dependiente'; cabeceraCue: string; cabeceraUserId: string }>(),
  campaign: { status: 'active' as const, distributionEnabled: true, overassignmentAllowed: false },
  products: new Set(['product-1']),
  quotas: new Map<string, number>(),
  stock: new Map<string, number>([['campaign-1:product-1', 100]]),
  requests: new Map<string, unknown>(),
  requestLines: new Map<string, unknown[]>(),
  idempotency: new Map<string, { payloadHash: string; response: unknown }>(),
}

const repository: RequestRepository = {
  async transaction(operation) { return operation(repository) },
  async getAccountStatus(userId) { return state.accounts.get(userId) ?? null },
  async hasActiveMembership(userId, capability) { return state.memberships.has(`${userId}:${capability}`) },
  async hasSchoolAssignment(userId, cueAnexo, capability) {
    if (capability === 'cabecera') return state.assignments.get(cueAnexo)?.cabeceraUserId === userId
    return [...state.assignments.values()].some((assignment) => assignment.cueAnexo === cueAnexo && userId === 'supervisor-1')
  },
  async getCampaign(campaignId) { return campaignId === 'campaign-1' ? state.campaign : null },
  async productExists(productId) { return state.products.has(productId) },
  async getQuota(campaignId, productId, cabeceraCue) { return state.quotas.get(`${campaignId}:${productId}:${cabeceraCue}`) ?? 0 },
  async getAssignment(cueAnexo) { return state.assignments.get(cueAnexo) ?? null },
  async getRequestByIdempotency(actorId, idempotencyKey) { return state.idempotency.get(`${actorId}:${idempotencyKey}`) ?? null },
  async saveRequest(request, lines, idempotency) {
    state.requests.set(request.requestId, request)
    state.requestLines.set(request.requestId, lines)
    state.idempotency.set(`${request.createdByUserId}:${idempotency.key}`, idempotency.record)
  },
  async getEnrollmentRecommendations() { return [{ productId: 'product-1', students: 12, suggested: 12, sourceCutId: 'cut-1' }] },
}

const cabecera: SessionUser = {
  id: 'cabecera-user', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}

const eligibility = async (_cue: string): Promise<Eligibility> => ({ eligible: true, severity: 'Crítica', evaluatedAt: '2026-11-09T00:00:00.000Z' })

const validInput = (overrides: Record<string, unknown> = {}) => ({
  campaignId: 'campaign-1', recipientCueAnexo: '180123457',
  lines: [{ productId: 'product-1', quantity: 25 }], submit: true, idempotencyKey: 'request-key-1',
  ...overrides,
})

beforeEach(() => {
  state.accounts.clear()
  state.memberships.clear()
  state.assignments.clear()
  state.quotas.clear()
  state.stock.clear()
  state.stock.set('campaign-1:product-1', 100)
  state.quotas.set('campaign-1:product-1:180123456', 100)
  state.requests.clear()
  state.requestLines.clear()
  state.idempotency.clear()
  state.accounts.set('cabecera-user', { emailVerified: true, banned: false })
  state.memberships.add('cabecera-user:cabecera')
  state.accounts.set('supervisor-1', { emailVerified: true, banned: false })
  state.memberships.add('supervisor-1:supervisor')
  state.assignments.set('180123456', { cueAnexo: '180123456', relationship: 'cabecera', cabeceraCue: '180123456', cabeceraUserId: 'cabecera-user' })
  state.assignments.set('180123457', { cueAnexo: '180123457', relationship: 'dependiente', cabeceraCue: '180123456', cabeceraUserId: 'cabecera-user' })
})

describe('createRequest', () => {
  it('rejects submission when current severity is not critical without writing', async () => {
    const notCritical = async (): Promise<Eligibility> => ({ eligible: false, severity: 'Alta', evaluatedAt: '2026-11-09T00:00:00.000Z' })

    await expect(createRequest(cabecera, validInput(), repository, notCritical)).rejects.toMatchObject({ code: 'ineligible' })
    expect(state.requests.size).toBe(0)
  })

  it('creates a pending request without reserving stock or quota', async () => {
    const beforeStock = state.stock.get('campaign-1:product-1')
    const beforeQuotas = [...state.quotas.entries()]

    const result = await createRequest(cabecera, validInput(), repository, eligibility)

    expect(result.status).toBe('pending')
    expect(result.lines).toEqual([{ productId: 'product-1', quantity: 25 }])
    expect(state.stock.get('campaign-1:product-1')).toBe(beforeStock)
    expect([...state.quotas.entries()]).toEqual(beforeQuotas)
  })

  it('replays the same idempotency key and rejects a changed payload', async () => {
    const input = validInput()
    const first = await createRequest(cabecera, input, repository, eligibility)
    const retry = await createRequest(cabecera, input, repository, eligibility)

    expect(retry).toEqual(first)
    await expect(createRequest(cabecera, validInput({ lines: [{ productId: 'product-1', quantity: 26 }] }), repository, eligibility))
      .rejects.toMatchObject({ code: 'idempotency_conflict' })
    expect(state.requests.size).toBe(1)
  })

  it('rejects non-positive or fractional request lines before writing', async () => {
    await expect(createRequest(cabecera, validInput({ lines: [{ productId: 'product-1', quantity: 0 }] }), repository, eligibility))
      .rejects.toMatchObject({ code: 'invalid_quantity' })
    await expect(createRequest(cabecera, validInput({ lines: [{ productId: 'product-1', quantity: 1.5 }] }), repository, eligibility))
      .rejects.toMatchObject({ code: 'invalid_quantity' })
    expect(state.requests.size).toBe(0)
  })

  it('denies requests for a school outside the signed cabecera assignment', async () => {
    await expect(createRequest(cabecera, validInput({ recipientCueAnexo: '180123458' }), repository, eligibility))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(state.requests.size).toBe(0)
  })
})
