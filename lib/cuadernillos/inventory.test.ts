import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { addStock, setQuota, type InventoryRepository } from './inventory'

type Campaign = { status: 'active' | 'draft' | 'closed'; distributionEnabled: boolean; overassignmentAllowed: boolean | null }
type StoredIdempotency = { payloadHash: string; response: unknown }

const state = {
  accounts: new Map<string, { emailVerified: boolean; banned: boolean }>(),
  memberships: new Set<string>(),
  campaigns: new Map<string, Campaign>(),
  products: new Set<string>(),
  stock: new Map<string, number>(),
  quotas: new Map<string, number>(),
  movements: [] as Array<{ quantity: number; kind: string }>,
  idempotency: new Map<string, StoredIdempotency>(),
  assignments: new Set<string>(),
}

const key = (...parts: string[]) => parts.join(':')

const repository: InventoryRepository = {
  async transaction(operation) { return operation(repository) },
  async getAccountStatus(userId) { return state.accounts.get(userId) ?? null },
  async hasActiveMembership(userId, capability) { return state.memberships.has(key(userId, capability)) },
  async hasSchoolAssignment(userId, cueAnexo, capability) { return state.assignments.has(key(userId, cueAnexo, capability)) },
  async getCampaign(campaignId) { return state.campaigns.get(campaignId) ?? null },
  async productExists(productId) { return state.products.has(productId) },
  async hasStock(campaignId, productId) { return state.stock.has(key(campaignId, productId)) },
  async getStock(campaignId, productId) { return state.stock.get(key(campaignId, productId)) ?? 0 },
  async setStock(campaignId, productId, quantity) { state.stock.set(key(campaignId, productId), quantity) },
  async sumQuotas(campaignId, productId, exceptCabeceraCue) {
    return [...state.quotas.entries()].reduce((sum, [rowKey, quantity]) => {
      const [rowCampaign, rowProduct, rowCabecera] = rowKey.split(':')
      return sum + (rowCampaign === campaignId && rowProduct === productId && rowCabecera !== exceptCabeceraCue ? quantity : 0)
    }, 0)
  },
  async getQuota(campaignId, productId, cabeceraCue) { return state.quotas.get(key(campaignId, productId, cabeceraCue)) ?? 0 },
  async setQuotaValue(campaignId, productId, cabeceraCue, quantity) { state.quotas.set(key(campaignId, productId, cabeceraCue), quantity) },
  async recordStockMovement(movement) { state.movements.push(movement) },
  async getIdempotency(actorId, operation, idempotencyKey) { return state.idempotency.get(key(actorId, operation, idempotencyKey)) ?? null },
  async saveIdempotency(actorId, operation, idempotencyKey, record) {
    state.idempotency.set(key(actorId, operation, idempotencyKey), record)
  },
  async isConfirmedCabecera(cueAnexo) { return state.assignments.has(key('confirmed', cueAnexo)) },
}

const planner: SessionUser = {
  id: 'planner-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}

const configure = () => {
  state.accounts.set('planner-1', { emailVerified: true, banned: false })
  state.memberships.add('planner-1:planning')
  state.campaigns.set('campaign-1', { status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  state.products.add('product-1')
  state.stock.set('campaign-1:product-1', 100)
  state.assignments.add('confirmed:180123456')
}

beforeEach(() => {
  state.accounts.clear()
  state.memberships.clear()
  state.campaigns.clear()
  state.products.clear()
  state.stock.clear()
  state.quotas.clear()
  state.movements.length = 0
  state.idempotency.clear()
  state.assignments.clear()
  configure()
})

describe('booklet inventory', () => {
  it('assigns a quota without reducing global stock', async () => {
    const view = await setQuota(planner, {
      campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 40,
    }, repository)

    expect(view).toMatchObject({ assigned: 40, globalStock: 100, quotaAvailable: 40 })
    expect(state.stock.get('campaign-1:product-1')).toBe(100)
  })

  it('does not mutate inventory for an actor without planning membership', async () => {
    const actor = { ...planner, id: 'staff-user' }
    state.accounts.set(actor.id, { emailVerified: true, banned: false })
    const before = [...state.stock.entries()]

    await expect(setQuota(actor, {
      campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 10,
    }, repository)).rejects.toMatchObject({ code: 'forbidden' })
    expect([...state.stock.entries()]).toEqual(before)
    expect(state.quotas.size).toBe(0)
  })

  it('rejects negative or fractional stock and quota quantities without writes', async () => {
    await expect(addStock(planner, {
      campaignId: 'campaign-1', productId: 'product-1', quantity: -1, movement: 'replenishment', idempotencyKey: 'negative',
    }, repository)).rejects.toMatchObject({ code: 'invalid_quantity' })
    await expect(setQuota(planner, {
      campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 1.5,
    }, repository)).rejects.toMatchObject({ code: 'invalid_quantity' })
    expect(state.movements).toEqual([])
    expect(state.quotas.size).toBe(0)
  })

  it('blocks writes until an active campaign has explicit distribution policy', async () => {
    state.campaigns.set('campaign-1', { status: 'active', distributionEnabled: false, overassignmentAllowed: null })

    await expect(setQuota(planner, {
      campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 10,
    }, repository)).rejects.toMatchObject({ code: 'policy_unresolved' })
    expect(state.quotas.size).toBe(0)
  })

  it('refuses quotas beyond total stock instead of silently overassigning', async () => {
    state.quotas.set('campaign-1:product-1:180000001', 80)

    await expect(setQuota(planner, {
      campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 21,
    }, repository)).rejects.toMatchObject({ code: 'quota_exceeds_stock' })
    expect(state.quotas.get('campaign-1:product-1:180123456')).toBeUndefined()
  })

  it('records positive stock movements and makes an initial import idempotent', async () => {
    state.stock.delete('campaign-1:product-1')
    const input = {
      campaignId: 'campaign-1', productId: 'product-1', quantity: 25, movement: 'initial' as const,
      idempotencyKey: 'stock-initial-1',
    }

    const first = await addStock(planner, input, repository)
    const retry = await addStock(planner, input, repository)

    expect(first).toEqual(retry)
    expect(first.globalStock).toBe(25)
    expect(state.movements).toHaveLength(1)
    expect(state.movements[0]).toMatchObject({ quantity: 25, kind: 'initial', actorUserId: planner.id })
  })
})

describe('admin write authority', () => {
  const admin: SessionUser = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  beforeEach(() => {
    configure()
    state.accounts.set(admin.id, { emailVerified: true, banned: false })
  })

  it('sets quota and stock without planning membership, leaving the admin as the actor', async () => {
    const view = await setQuota(admin, { campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 40 }, repository)
    expect(view).toMatchObject({ assigned: 40, globalStock: 100, quotaAvailable: 40 })

    await addStock(admin, { campaignId: 'campaign-1', productId: 'product-1', quantity: 25, movement: 'replenishment', idempotencyKey: 'admin-stock-1' }, repository)
    expect(state.stock.get('campaign-1:product-1')).toBe(125)
  })

  it('denies a banned admin and a non-admin without planning membership', async () => {
    state.accounts.set('admin-banned', { emailVerified: true, banned: true })
    await expect(setQuota({ ...admin, id: 'admin-banned' }, { campaignId: 'campaign-1', cabeceraCueAnexo: '180123456', productId: 'product-1', quantity: 1 }, repository))
      .rejects.toMatchObject({ code: 'forbidden' })
    state.accounts.set('outsider', { emailVerified: true, banned: false })
    await expect(addStock({ ...admin, id: 'outsider', role: 'consulta' }, { campaignId: 'campaign-1', productId: 'product-1', quantity: 1, movement: 'replenishment', idempotencyKey: 'x' }, repository))
      .rejects.toMatchObject({ code: 'forbidden' })
  })
})
