import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { GeSchemaReady } from '@/lib/infraestructura/ge-db'
import { dispatchRemito, createRemitoRepository, listRemitosForPlanning } from './remito-dispatch'
import { receiveRemitoAtCabecera, receiveRemitoLineAtSchool, type ReceiptDb } from './remito-receipts'
import { assignFromReserve, createReserveRepository, getReserveSummary, type AssignFromReserveInput } from './reserve'

const CAB = '180000100'
const OTHER_CAB = '180000500'
const SCHOOL_A = '180000200'
const SCHOOL_B = '180000300'
const NOT_CRITICAL = '180000400'

let client: PGlite
let db: ReceiptDb
let counter = 0
const calls: string[] = []

const actor = (id: string, role: SessionUser['role'] = 'consulta', cueAnexo?: string): SessionUser =>
  ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo: cueAnexo ?? null })
const planner = actor('u-plan')
const cabecera = actor('u-cab')
const otherCabecera = actor('u-cab2')
const supervisor = actor('u-sup')
const admin = actor('u-admin', 'admin')
const schoolA = actor('u-school-a', 'operador_establecimiento', '1800002-00')

const eligibility: Record<string, string> = { [SCHOOL_A]: 'Crítica', [SCHOOL_B]: 'Crítica', [CAB]: 'Crítica', [NOT_CRITICAL]: 'Alta' }
const overrides = {
  prepareCurrentEligibilityProjection: async () => ({}) as GeSchemaReady,
  lockEligibilitySources: async () => undefined,
  approvalAuthorityReady: async () => true,
  getRecipientEligibility: async (cue: string) => ({ eligible: eligibility[cue] === 'Crítica', severity: eligibility[cue] ?? null, evaluatedAt: 'now', name: `School ${cue}` }),
}
const remitoRepo = () => createRemitoRepository(db as never, overrides)
const reserveRepo = () => createReserveRepository(db as never, overrides)
const q = async <T>(sql: string) => (await client.query<T>(sql)).rows
const key = () => `k-${++counter}`

beforeAll(async () => {
  client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  db = drizzle(client) as unknown as ReceiptDb
  await client.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role) VALUES
      ('u-plan', 'Planning', 'plan@example.test', true, now(), now(), 'consulta'),
      ('u-cab', 'Cabecera Norte', 'cab@example.test', true, now(), now(), 'consulta'),
      ('u-cab2', 'Cabecera Sur', 'cab2@example.test', true, now(), now(), 'consulta'),
      ('u-sup', 'Supervisor', 'sup@example.test', true, now(), now(), 'consulta'),
      ('u-admin', 'Admin', 'admin@example.test', true, now(), now(), 'admin'),
      ('u-school-a', 'School A', 'a@example.test', true, now(), now(), 'operador_establecimiento'),
      ('u-school-b', 'School B', 'b@example.test', true, now(), now(), 'operador_establecimiento');
    INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
      ('m1', 'u-plan', 'planning', 'u-plan'), ('m2', 'u-cab', 'cabecera', 'u-plan'), ('m3', 'u-cab2', 'cabecera', 'u-plan'),
      ('m4', 'u-sup', 'supervisor', 'u-plan');
    INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed) VALUES
      ('c1', 'Campaign', 'active', true, false), ('closed', 'Closed', 'closed', true, false);
    INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ('p1', 'Primero', 'primaria', '1'), ('p2', 'Segundo', 'primaria', '2');
    INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
      cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at) VALUES
      ('${CAB}', 'Cabecera Norte', 'cabecera', 'Supervisor', 'u-sup', '${CAB}', 'u-cab', '[{"sourceId":"t","location":"1"}]', 'u-plan', now()),
      ('${OTHER_CAB}', 'Cabecera Sur', 'cabecera', 'Supervisor', 'u-sup', '${OTHER_CAB}', 'u-cab2', '[{"sourceId":"t","location":"2"}]', 'u-plan', now());
    INSERT INTO booklet_stock (campaign_id, product_id, quantity, updated_at) VALUES ('c1', 'p1', 1000, now()), ('c1', 'p2', 1000, now());
  `)
}, 120_000)
afterAll(async () => { await client.close() })

/** Planeamiento reserves `quantities` to the cabecera and the cabecera signs for `received` (default: everything). */
async function reserveAndSign(quantities: Record<string, number>, received: Record<string, number> = quantities, cue = CAB, signer = cabecera) {
  const items = Object.entries(quantities).map(([productId, quantity]) => ({ productId, quantity }))
  const remito = await dispatchRemito(planner, { campaignId: 'c1', modo: 'cabecera', cabeceraCueAnexo: cue, reserve: true, items, idempotencyKey: key() }, remitoRepo())
  const short = items.some((item) => received[item.productId] < item.quantity)
  const [line] = await q<{ id: string }>(`SELECT id FROM booklet_remito_line WHERE remito_id = '${remito.remitoId}'`)
  await receiveRemitoAtCabecera(signer, remito.remitoId, {
    idempotencyKey: key(),
    lines: [{ lineId: line.id, items: items.map((item) => ({ productId: item.productId, receivedQuantity: received[item.productId] })), ...(short ? { shortfallReason: 'faltante' } : {}) }],
  }, db)
  return remito
}

const assign = (overridesInput: Partial<AssignFromReserveInput> = {}, who: SessionUser = cabecera) => assignFromReserve(who, {
  campaignId: 'c1', recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: key(), ...overridesInput,
}, reserveRepo())
const balance = async (productId: string, cue = CAB) =>
  (await getReserveSummary(cue === CAB ? cabecera : otherCabecera, 'c1', reserveRepo())).balances.find((b) => b.productId === productId)

describe('money path: reserve 100, split 20 and 80', () => {
  it('assigns the cabecera reserve to two critical schools without any supervisor and never past the balance', async () => {
    const stockBefore = (await q<{ quantity: number }>(`SELECT quantity FROM booklet_stock WHERE product_id = 'p1'`))[0].quantity
    await reserveAndSign({ p1: 100 })
    const stockAfterReserve = (await q<{ quantity: number }>(`SELECT quantity FROM booklet_stock WHERE product_id = 'p1'`))[0].quantity
    expect(stockAfterReserve).toBe(stockBefore - 100)
    expect(await balance('p1')).toEqual({ productId: 'p1', productName: 'Primero', received: 100, assigned: 0, available: 100 })

    const toA = await assign({ recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p1', quantity: 20 }] })
    expect(toA).toMatchObject({ campaignId: 'c1', recipientCueAnexo: SCHOOL_A, recipientName: `School ${SCHOOL_A}`, items: [{ productId: 'p1', quantity: 20 }] })
    await assign({ recipientCueAnexo: SCHOOL_B, items: [{ productId: 'p1', quantity: 80 }] })
    expect(await balance('p1')).toMatchObject({ received: 100, assigned: 100, available: 0 })
    await expect(assign({ recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p1', quantity: 1 }] }))
      .rejects.toMatchObject({ code: 'insufficient_reserve', status: 409, details: { productIds: ['p1'] } })

    // Onward sends debit nothing from the global stock and record no movement.
    expect((await q<{ quantity: number }>(`SELECT quantity FROM booklet_stock WHERE product_id = 'p1'`))[0].quantity).toBe(stockAfterReserve)
    expect(await q(`SELECT 1 FROM booklet_stock_movement WHERE remito_id = '${toA.remitoId}'`)).toHaveLength(0)

    const [onward] = await q<Record<string, unknown>>(`SELECT modo, cabecera_cue_anexo, origen_cabecera_cue_anexo, dispatched_by_user_id, status FROM booklet_remito WHERE id = '${toA.remitoId}'`)
    expect(onward).toEqual({ modo: 'directo', cabecera_cue_anexo: null, origen_cabecera_cue_anexo: CAB, dispatched_by_user_id: 'u-cab', status: 'dispatched' })
    expect(await q(`SELECT status, reserva FROM booklet_remito_line WHERE remito_id = '${toA.remitoId}'`)).toEqual([{ status: 'in_transit', reserva: false }])

    // School A signs with the unchanged school receipt flow and the onward remito becomes received.
    const [lineA] = await q<{ id: string }>(`SELECT id FROM booklet_remito_line WHERE remito_id = '${toA.remitoId}'`)
    await receiveRemitoLineAtSchool(schoolA, lineA.id, { idempotencyKey: key(), items: [{ productId: 'p1', receivedQuantity: 20 }] }, db)
    expect(await q(`SELECT status FROM booklet_remito WHERE id = '${toA.remitoId}'`)).toEqual([{ status: 'received' }])

    const summary = await getReserveSummary(cabecera, 'c1', reserveRepo())
    expect(summary).toMatchObject({ campaignId: 'c1', cabeceraCueAnexo: CAB })
    expect(summary.assignments.map((a) => [a.recipientCueAnexo, a.status, a.items.map((i) => i.quantity)])).toEqual(
      expect.arrayContaining([[SCHOOL_A, 'received', [20]], [SCHOOL_B, 'in_transit', [80]]]))
    expect(summary.assignments[0]).toMatchObject({ remitoId: expect.any(String), recipientName: expect.any(String), dispatchedAt: expect.any(String) })
    expect(summary.assignments[0].items[0]).toMatchObject({ productId: 'p1', productName: 'Primero' })
  })

  it('counts only what the cabecera confirmed receiving and keeps cabeceras apart', async () => {
    await reserveAndSign({ p2: 50 }, { p2: 40 }, OTHER_CAB, otherCabecera)
    expect(await balance('p2', OTHER_CAB)).toMatchObject({ received: 40, assigned: 0, available: 40 })
    expect(await balance('p2')).toBeUndefined()
    await expect(assign({ items: [{ productId: 'p2', quantity: 1 }] })).rejects.toMatchObject({ code: 'insufficient_reserve', details: { productIds: ['p2'] } })
    await assign({ items: [{ productId: 'p2', quantity: 40 }], recipientCueAnexo: SCHOOL_B }, otherCabecera)
    await expect(assign({ items: [{ productId: 'p2', quantity: 1 }] }, otherCabecera)).rejects.toMatchObject({ code: 'insufficient_reserve' })
  })

  it('does not count a reserve the cabecera has not signed yet', async () => {
    await dispatchRemito(planner, { campaignId: 'c1', modo: 'cabecera', cabeceraCueAnexo: CAB, reserve: true, items: [{ productId: 'p2', quantity: 70 }], idempotencyKey: key() }, remitoRepo())
    await expect(assign({ items: [{ productId: 'p2', quantity: 1 }] })).rejects.toMatchObject({ code: 'insufficient_reserve' })
  })

  it('refuses to oversell when two assignments race for the same balance', async () => {
    await reserveAndSign({ p1: 100 })
    const before = (await balance('p1'))!.available
    const results = await Promise.allSettled([
      assign({ recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p1', quantity: before }] }),
      assign({ recipientCueAnexo: SCHOOL_B, items: [{ productId: 'p1', quantity: before }] }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(failed.reason).toMatchObject({ code: 'insufficient_reserve', status: 409 })
    expect((await balance('p1'))!.available).toBe(0)
  })
})

describe('assignFromReserve rules', () => {
  it('requires the cabecera capability and ownership, and never the supervisor or admin', async () => {
    await reserveAndSign({ p1: 10 })
    for (const who of [supervisor, admin, planner, schoolA, actor('u-ghost')]) {
      await expect(assign({}, who)).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    }
    await expect(getReserveSummary(supervisor, 'c1', reserveRepo())).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    await expect(getReserveSummary(admin, 'c1', reserveRepo())).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    await expect(getReserveSummary(null as unknown as SessionUser, 'c1', reserveRepo())).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a recipient that is not Crítica and lists it', async () => {
    await reserveAndSign({ p1: 10 })
    const error = await assign({ recipientCueAnexo: NOT_CRITICAL }).catch((e) => e)
    expect(error).toMatchObject({ code: 'recipients_not_critical', status: 409, details: { recipientCueAnexos: [NOT_CRITICAL] } })
  })

  it('may send to the cabecera own school when it is Crítica', async () => {
    await reserveAndSign({ p1: 10 })
    expect(await assign({ recipientCueAnexo: CAB })).toMatchObject({ recipientCueAnexo: CAB })
  })

  it('applies the campaign policy', async () => {
    await expect(assign({ campaignId: 'closed' })).rejects.toMatchObject({ code: 'campaign_inactive', status: 409 })
    await expect(assign({ campaignId: 'ghost' })).rejects.toMatchObject({ code: 'campaign_inactive', status: 409 })
  })

  it('rejects malformed input before touching the database', async () => {
    const bad: Array<Partial<AssignFromReserveInput>> = [
      { campaignId: ' ' }, { recipientCueAnexo: '123' }, { idempotencyKey: ' ' }, { items: [] },
      { items: [{ productId: 'p1', quantity: 0 }] }, { items: [{ productId: 'p1', quantity: 1.5 }] },
      { items: [{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }] },
    ]
    for (const value of bad) await expect(assign(value)).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a product that does not exist', async () => {
    await expect(assign({ items: [{ productId: 'ghost', quantity: 1 }] })).rejects.toMatchObject({ code: 'product_not_found', status: 404 })
  })

  it('replays an identical retry once and conflicts on another payload for the same key', async () => {
    await reserveAndSign({ p1: 10 })
    const input = { campaignId: 'c1', recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p1', quantity: 3 }], idempotencyKey: key() }
    const first = await assignFromReserve(cabecera, input, reserveRepo())
    const before = (await balance('p1'))!.assigned
    expect(await assignFromReserve(cabecera, input, reserveRepo())).toEqual(first)
    expect((await balance('p1'))!.assigned).toBe(before)
    await expect(assignFromReserve(cabecera, { ...input, items: [{ productId: 'p1', quantity: 4 }] }, reserveRepo())).rejects.toMatchObject({ code: 'idempotency_conflict', status: 409 })
  })

  it('locks per product in sorted order after the sources and idempotency locks, before reading balances', async () => {
    await reserveAndSign({ p1: 10, p2: 10 })
    calls.length = 0
    const traced = createReserveRepository(db as never, {
      ...overrides,
      async lockEligibilitySources() { calls.push('sources') },
      async lockIdempotency() { calls.push('idempotency') },
      async lockReserve(_cue, _campaign, productId) { calls.push(`reserve:${productId}`) },
    })
    await assignFromReserve(cabecera, { campaignId: 'c1', recipientCueAnexo: SCHOOL_A, items: [{ productId: 'p2', quantity: 1 }, { productId: 'p1', quantity: 1 }], idempotencyKey: key() }, traced)
    expect(calls).toEqual(['sources', 'idempotency', 'reserve:p1', 'reserve:p2'])
  })
})

describe('existing remito behavior around a reserve', () => {
  it('lists the reserve for planning with reserva true and the onward remito with its origin', async () => {
    const page = await listRemitosForPlanning(planner, { campaignId: 'c1', limit: 100 }, remitoRepo())
    expect(page.remitos.some((r) => r.lines.some((l) => l.reserva === true))).toBe(true)
    const onward = page.remitos.find((r) => r.origenCabeceraCueAnexo === CAB)!
    expect(onward).toMatchObject({ modo: 'directo', cabeceraCueAnexo: null })
    expect(onward.lines.every((l) => l.reserva === false)).toBe(true)
  })

  it('refuses an origin on a cabecera-mode remito at the database level', async () => {
    await expect(client.exec(`INSERT INTO booklet_remito (id, campaign_id, modo, cabecera_cue_anexo, origen_cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
      VALUES ('bad-origin', 'c1', 'cabecera', '${CAB}', '${CAB}', 'dispatched', 'u-plan', now())`)).rejects.toThrow()
  })
})
