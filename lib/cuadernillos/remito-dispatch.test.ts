import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { GeSchemaReady } from '@/lib/infraestructura/ge-db'
import { createRemitoRepository, dispatchRemito, listRemitosForPlanning, type DispatchRemitoInput, type RemitoRepository } from './remito-dispatch'

type Movement = { campaignId: string; productId: string; remitoId: string; quantity: number; actorUserId: string; idempotencyKey: string }
type StoredRemito = Parameters<RemitoRepository['insertRemito']>[0]

const state = {
  accounts: new Map<string, { emailVerified: boolean; banned: boolean }>(),
  memberships: new Set<string>(),
  authorityReady: true,
  schools: new Map<string, { severity: string; name: string | null }>(),
  stock: new Map<string, number>(),
  idempotency: new Map<string, { payloadHash: string; response: unknown }>(),
  movements: [] as Movement[],
  remitos: [] as StoredRemito[],
  calls: [] as string[],
}

const repository: RemitoRepository = {
  async prepareCurrentEligibilityProjection() { state.calls.push('prepare'); return {} as GeSchemaReady },
  async transaction(operation) {
    state.calls.push('transaction')
    const backup = {
      stock: new Map(state.stock), idempotency: new Map(state.idempotency),
      movements: [...state.movements], remitos: [...state.remitos],
    }
    try { return await operation(repository) } catch (error) {
      state.stock.clear(); for (const [key, value] of backup.stock) state.stock.set(key, value)
      state.idempotency.clear(); for (const [key, value] of backup.idempotency) state.idempotency.set(key, value)
      state.movements.splice(0, state.movements.length, ...backup.movements)
      state.remitos.splice(0, state.remitos.length, ...backup.remitos)
      throw error
    }
  },
  async lockEligibilitySources() { state.calls.push('lock-sources') },
  async lockIdempotency() { state.calls.push('lock-idempotency') },
  async lockProduct(_campaign, productId) { state.calls.push(`lock-product:${productId}`) },
  async getAccountStatus(id) { return state.accounts.get(id) ?? null },
  async hasActiveMembership(id, capability) { return state.memberships.has(`${id}:${capability}`) },
  async hasSchoolAssignment() { return false },
  async getCampaign() { return { status: 'active', distributionEnabled: true, overassignmentAllowed: false } },
  async approvalAuthorityReady() { return state.authorityReady },
  async getRecipientEligibility(cue) {
    const school = state.schools.get(cue)
    return { eligible: school?.severity === 'Crítica', severity: school?.severity ?? null, evaluatedAt: '2026-11-14T00:00:00.000Z', name: school?.name ?? null }
  },
  async productExists(productId) { return productId.startsWith('product-') },
  async getStock(campaignId, productId) { return state.stock.get(`${campaignId}:${productId}`) ?? 0 },
  async debitStock(campaignId, productId, quantity) {
    const key = `${campaignId}:${productId}`, stock = state.stock.get(key) ?? 0
    if (stock < quantity) return false
    state.stock.set(key, stock - quantity); return true
  },
  async recordDispatchMovement(movement) { state.movements.push(movement) },
  async insertRemito(remito) { state.remitos.push(remito) },
  async getIdempotency(actorId, operation, key) { return state.idempotency.get(`${actorId}:${operation}:${key}`) ?? null },
  async saveIdempotency(actorId, operation, key, record) { state.idempotency.set(`${actorId}:${operation}:${key}`, record) },
  async listRemitos() { return [] },
}

const planner: SessionUser = { id: 'planner-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const input = (overrides: Partial<DispatchRemitoInput> = {}): DispatchRemitoInput => ({
  campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', idempotencyKey: 'dispatch-1',
  lines: [
    { recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 30 }, { productId: 'product-2', quantity: 25 }] },
    { recipientCueAnexo: '180000300', items: [{ productId: 'product-1', quantity: 18 }] },
  ],
  ...overrides,
})

beforeEach(() => {
  state.accounts.clear(); state.memberships.clear(); state.idempotency.clear(); state.schools.clear(); state.stock.clear()
  state.movements.length = 0; state.remitos.length = 0; state.calls.length = 0
  state.authorityReady = true
  state.accounts.set(planner.id, { emailVerified: true, banned: false }); state.memberships.add(`${planner.id}:planning`)
  state.schools.set('180000200', { severity: 'Crítica', name: 'Escuela A' })
  state.schools.set('180000300', { severity: 'Crítica', name: null })
  state.stock.set('campaign-1:product-1', 100); state.stock.set('campaign-1:product-2', 40)
})

const untouched = () => {
  expect(state.stock.get('campaign-1:product-1')).toBe(100)
  expect(state.stock.get('campaign-1:product-2')).toBe(40)
  expect(state.movements).toHaveLength(0)
  expect(state.remitos).toHaveLength(0)
  expect(state.idempotency.size).toBe(0)
}

describe('dispatchRemito', () => {
  it('rejects an actor without planning capability and writes nothing', async () => {
    state.memberships.clear()
    await expect(dispatchRemito(planner, input(), repository)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    untouched()
  })

  it('rejects a cabecera without confirmed assignment authority', async () => {
    state.authorityReady = false
    await expect(dispatchRemito(planner, input(), repository)).rejects.toMatchObject({ code: 'authority_unavailable', status: 503 })
    untouched()
  })

  it('rejects the whole remito when any recipient is no longer Crítica and lists them', async () => {
    state.schools.set('180000300', { severity: 'Alta', name: 'Escuela B' })
    const error = await dispatchRemito(planner, input(), repository).catch((e) => e)
    expect(error).toMatchObject({ code: 'recipients_not_critical', status: 409, details: { recipientCueAnexos: ['180000300'] } })
    untouched()
  })

  it('rejects insufficient stock summed across lines and lists the products', async () => {
    state.stock.set('campaign-1:product-1', 47)
    const error = await dispatchRemito(planner, input(), repository).catch((e) => e)
    expect(error).toMatchObject({ code: 'insufficient_stock', status: 409, details: { productIds: ['product-1'] } })
    expect(state.stock.get('campaign-1:product-1')).toBe(47)
    expect(state.stock.get('campaign-1:product-2')).toBe(40)
    expect(state.movements).toHaveLength(0)
    expect(state.remitos).toHaveLength(0)
  })

  it('rejects malformed input before touching the repository', async () => {
    const bad = [
      input({ lines: [] }),
      input({ lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 0 }] }] }),
      input({ lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 1.5 }] }] }),
      input({ lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 1 }, { productId: 'product-1', quantity: 2 }] }] }),
      input({ lines: [
        { recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 1 }] },
        { recipientCueAnexo: '180000200', items: [{ productId: 'product-2', quantity: 1 }] },
      ] }),
      input({ idempotencyKey: '  ' }),
    ]
    for (const value of bad) await expect(dispatchRemito(planner, value, repository)).rejects.toMatchObject({ status: 400 })
    expect(state.calls).toHaveLength(0)
  })

  it('debits stock, binds one dispatch movement per product to the remito and persists lines and items', async () => {
    const result = await dispatchRemito(planner, input(), repository)

    expect(state.stock.get('campaign-1:product-1')).toBe(52)
    expect(state.stock.get('campaign-1:product-2')).toBe(15)
    expect(state.movements).toHaveLength(2)
    expect(state.movements.map((m) => [m.productId, m.quantity]).sort()).toEqual([['product-1', 48], ['product-2', 25]])
    for (const movement of state.movements) {
      expect(movement).toMatchObject({ campaignId: 'campaign-1', remitoId: result.remitoId, actorUserId: 'planner-1' })
    }

    expect(state.remitos).toHaveLength(1)
    const [remito] = state.remitos
    expect(remito).toMatchObject({ id: result.remitoId, campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', status: 'dispatched', dispatchedByUserId: 'planner-1' })
    expect(remito.dispatchedAt).toBeInstanceOf(Date)
    expect(remito.lines.map((l) => ({ cue: l.recipientCueAnexo, name: l.recipientName, status: l.status, items: l.items }))).toEqual([
      { cue: '180000200', name: 'Escuela A', status: 'in_transit', items: [{ productId: 'product-1', dispatchedQuantity: 30 }, { productId: 'product-2', dispatchedQuantity: 25 }] },
      { cue: '180000300', name: null, status: 'in_transit', items: [{ productId: 'product-1', dispatchedQuantity: 18 }] },
    ])
    expect(result).toMatchObject({ remitoId: remito.id, status: 'dispatched', lines: [
      { recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 30 }, { productId: 'product-2', quantity: 25 }] },
      { recipientCueAnexo: '180000300', items: [{ productId: 'product-1', quantity: 18 }] },
    ] })
    expect(state.idempotency.size).toBe(1)
  })

  it('prepares the eligibility projection before the transaction and locks sources first inside it', async () => {
    await dispatchRemito(planner, input(), repository)
    expect(state.calls.slice(0, 4)).toEqual(['prepare', 'transaction', 'lock-sources', 'lock-idempotency'])
    expect(state.calls.filter((c) => c.startsWith('lock-product'))).toEqual(['lock-product:product-1', 'lock-product:product-2'])
  })

  it('replays an identical retry without a second debit, movement or remito', async () => {
    const first = await dispatchRemito(planner, input(), repository)
    const second = await dispatchRemito(planner, input(), repository)
    expect(second).toEqual(first)
    expect(state.stock.get('campaign-1:product-1')).toBe(52)
    expect(state.movements).toHaveLength(2)
    expect(state.remitos).toHaveLength(1)
  })

  it('rejects the same key with a different payload', async () => {
    await dispatchRemito(planner, input(), repository)
    await expect(dispatchRemito(planner, input({ lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 1 }] }] }), repository))
      .rejects.toMatchObject({ code: 'idempotency_conflict', status: 409 })
    expect(state.remitos).toHaveLength(1)
    expect(state.stock.get('campaign-1:product-1')).toBe(52)
  })
})

describe('listRemitosForPlanning', () => {
  it('rejects an actor without planning capability', async () => {
    state.memberships.clear()
    await expect(listRemitosForPlanning(planner, {}, repository)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })

  it('pages newest first and returns a cursor only when more rows exist', async () => {
    const rows = ['r3', 'r2', 'r1'].map((id, index) => ({
      remitoId: id, campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', status: 'dispatched' as const,
      dispatchedByUserId: 'planner-1', dispatchedAt: new Date(Date.UTC(2026, 10, 14, 12 - index)), cabeceraReceivedAt: null, cabeceraReceivedBy: null, lines: [],
    }))
    const seen: unknown[] = []
    const paged: RemitoRepository = { ...repository, async listRemitos(query) { seen.push(query); return rows.slice(0, query.limit) } }
    const page = await listRemitosForPlanning(planner, { campaignId: 'campaign-1', limit: 2 }, paged)
    expect(seen[0]).toMatchObject({ campaignId: 'campaign-1', limit: 3, after: null })
    expect(page.remitos.map((r) => r.remitoId)).toEqual(['r3', 'r2'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).not.toBeNull()
    await listRemitosForPlanning(planner, { cursor: page.nextCursor! }, paged)
    expect(seen[1]).toMatchObject({ after: { remitoId: 'r2', dispatchedAt: rows[1].dispatchedAt } })
    await expect(listRemitosForPlanning(planner, { cursor: 'garbage' }, paged)).rejects.toMatchObject({ status: 400 })
  })
})

describe('dispatchRemito against PGlite', () => {
  it('persists stock, movements, remito, lines and items and lists them back', async () => {
    const scratch = await mkdtemp(`${tmpdir()}/remito-dispatch-`)
    const client = new PGlite(scratch)
    try {
      const db = drizzle(client)
      await migrate(db, { migrationsFolder: './drizzle' })
      await client.exec(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
          VALUES ('planner-1', 'Planner', 'planner@example.test', true, now(), now());
        INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id)
          VALUES ('m1', 'planner-1', 'planning', 'planner-1');
        INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
          VALUES ('campaign-1', 'Campaign', 'active', true, false);
        INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ('product-1', 'Primero', 'primaria', '1');
        INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
          cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at)
          VALUES ('180000100', 'Cabecera', 'cabecera', 'Supervisor', 'planner-1', '180000100', 'planner-1',
            '[{"sourceId":"test","location":"row 1"}]', 'planner-1', now());
        INSERT INTO booklet_stock (campaign_id, product_id, quantity, updated_at) VALUES ('campaign-1', 'product-1', 100, now());
      `)
      const repo = createRemitoRepository(db as never, {
        prepareCurrentEligibilityProjection: async () => ({}) as GeSchemaReady,
        lockEligibilitySources: async () => undefined,
        approvalAuthorityReady: async () => true,
        getRecipientEligibility: async (cue) => ({ eligible: true, severity: 'Crítica', evaluatedAt: 'now', name: `School ${cue}` }),
      })
      const result = await dispatchRemito(planner, {
        campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', idempotencyKey: 'pg-1',
        lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 30 }] }, { recipientCueAnexo: '180000300', items: [{ productId: 'product-1', quantity: 18 }] }],
      }, repo)

      const stock = await client.query<{ quantity: number }>(`SELECT quantity FROM booklet_stock WHERE product_id = 'product-1'`)
      expect(stock.rows).toEqual([{ quantity: 52 }])
      const movements = await client.query(`SELECT movement, quantity, remito_id, request_id, actor_user_id FROM booklet_stock_movement`)
      expect(movements.rows).toEqual([{ movement: 'dispatch', quantity: 48, remito_id: result.remitoId, request_id: null, actor_user_id: 'planner-1' }])
      const lines = await client.query(`SELECT recipient_cue_anexo, recipient_name, status FROM booklet_remito_line ORDER BY recipient_cue_anexo`)
      expect(lines.rows).toEqual([
        { recipient_cue_anexo: '180000200', recipient_name: 'School 180000200', status: 'in_transit' },
        { recipient_cue_anexo: '180000300', recipient_name: 'School 180000300', status: 'in_transit' },
      ])
      const items = await client.query(`SELECT dispatched_quantity, cabecera_received_quantity FROM booklet_remito_item ORDER BY dispatched_quantity`)
      expect(items.rows).toEqual([{ dispatched_quantity: 18, cabecera_received_quantity: null }, { dispatched_quantity: 30, cabecera_received_quantity: null }])

      const replay = await dispatchRemito(planner, {
        campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', idempotencyKey: 'pg-1',
        lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 30 }] }, { recipientCueAnexo: '180000300', items: [{ productId: 'product-1', quantity: 18 }] }],
      }, repo)
      expect(replay).toEqual(result)
      expect((await client.query(`SELECT quantity FROM booklet_stock`)).rows).toEqual([{ quantity: 52 }])

      const page = await listRemitosForPlanning(planner, { campaignId: 'campaign-1' }, repo)
      expect(page.hasMore).toBe(false)
      expect(page.remitos).toHaveLength(1)
      expect(page.remitos[0]).toMatchObject({ remitoId: result.remitoId, status: 'dispatched', cabeceraCueAnexo: '180000100' })
      expect(page.remitos[0].lines.map((l) => ({ cue: l.recipientCueAnexo, status: l.status, items: l.items }))).toEqual([
        { cue: '180000200', status: 'in_transit', items: [{ productId: 'product-1', productName: 'Primero', dispatchedQuantity: 30, cabeceraReceivedQuantity: null, schoolReceivedQuantity: null }] },
        { cue: '180000300', status: 'in_transit', items: [{ productId: 'product-1', productName: 'Primero', dispatchedQuantity: 18, cabeceraReceivedQuantity: null, schoolReceivedQuantity: null }] },
      ])

      await client.exec(`
        UPDATE booklet_remito SET status = 'received', cabecera_received_by_user_id = 'planner-1', cabecera_received_at = '2026-11-14T15:00:00Z';
        UPDATE booklet_remito_item SET cabecera_received_quantity = 25, school_received_quantity = 20 WHERE dispatched_quantity = 30;
        UPDATE booklet_remito_line SET status = 'received', cabecera_shortfall_reason = 'Cajas dañadas', school_shortfall_reason = 'Faltaron cajas',
          school_received_by_user_id = 'planner-1', school_received_at = '2026-11-14T16:00:00Z' WHERE recipient_cue_anexo = '180000200';
      `)
      const signed = await listRemitosForPlanning(planner, { campaignId: 'campaign-1' }, repo)
      expect(signed.remitos[0].cabeceraReceivedBy).toEqual({ userId: 'planner-1', name: 'Planner' })
      const [shortLine, openLine] = signed.remitos[0].lines
      expect(shortLine).toMatchObject({
        cabeceraShortfallReason: 'Cajas dañadas', schoolShortfallReason: 'Faltaron cajas',
        schoolReceivedBy: { userId: 'planner-1', name: 'Planner' }, schoolReceivedAt: '2026-11-14T16:00:00.000Z',
      })
      expect(openLine).toMatchObject({ cabeceraShortfallReason: null, schoolShortfallReason: null, schoolReceivedBy: null, schoolReceivedAt: null })
    } finally {
      await client.close()
      await rm(scratch, { recursive: true, force: true })
    }
  }, 120_000)
})
