import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import * as schema from '@/lib/db/schema'

let testDb: ReturnType<typeof drizzle<typeof schema>>
// Sibling modules call getDb() at import time, before the PGlite instance exists.
const lazyDb = vi.hoisted(() => ({ target: null as unknown as Record<PropertyKey, unknown> }))
vi.mock('@/lib/db', () => ({
  getDb: () => new Proxy({}, { get: (_, prop) => {
    const value = lazyDb.target[prop]
    return typeof value === 'function' ? value.bind(lazyDb.target) : value
  } }),
  getRawClient: () => { throw new Error('unused') },
}))

import { addRemitoObservation, getSupervisorControl } from './remito-control'

let client: PGlite
const actorOf = (id: string, role: SessionUser['role'] = 'consulta'): SessionUser =>
  ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })

beforeAll(async () => {
  client = new PGlite()
  testDb = drizzle(client, { schema })
  lazyDb.target = testDb as unknown as Record<PropertyKey, unknown>
  await migrate(testDb, { migrationsFolder: './drizzle' })
  await client.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role) VALUES
      ('sup1', 'Supervisor One', 'sup1@example.test', true, now(), now(), 'consulta'),
      ('sup2', 'Supervisor Two', 'sup2@example.test', true, now(), now(), 'consulta'),
      ('adm', 'Admin', 'adm@example.test', true, now(), now(), 'admin'),
      ('plan', 'Planeamiento', 'plan@example.test', true, now(), now(), 'consulta'),
      ('cab', 'Cabecera Account', 'cab@example.test', true, now(), now(), 'consulta'),
      ('esc', 'School Account', 'esc@example.test', true, now(), now(), 'consulta'),
      ('nobody', 'Nobody', 'nobody@example.test', true, now(), now(), 'consulta');
    INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
      ('m1', 'sup1', 'supervisor', 'adm'), ('m2', 'sup2', 'supervisor', 'adm');
    INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
      VALUES ('c1', 'Campaign', 'active', true, false), ('c2', 'Other', 'active', true, false);
    INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ('p1', 'Primero', 'primaria', '1'), ('p2', 'Segundo', 'primaria', '2');
    INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
      cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at) VALUES
      ('180000100', 'Cabecera Norte', 'cabecera', 'S1', 'sup1', '180000100', 'cab', '[{"sourceId":"test","location":"row 1"}]', 'adm', now()),
      ('180000300', 'Cabecera Sur', 'cabecera', 'S2', 'sup2', '180000300', 'cab', '[{"sourceId":"test","location":"row 1"}]', 'adm', now());
    -- A (older, cab 100): cabecera signed 25/30 on p1; line a1 school signed 20; line a2 at cabecera 8/10, school unsigned
    INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at,
      cabecera_received_by_user_id, cabecera_received_at) VALUES
      ('remA', 'c1', '180000100', 'received', 'plan', '2026-11-01T10:00:00Z', 'cab', '2026-11-02T10:00:00Z');
    INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
      VALUES ('remB', 'c1', '180000100', 'dispatched', 'plan', '2026-11-05T10:00:00Z'),
             ('remC', 'c2', '180000300', 'dispatched', 'plan', '2026-11-06T10:00:00Z');
    INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, recipient_name, status, cabecera_shortfall_reason,
      school_received_by_user_id, school_received_at, school_shortfall_reason) VALUES
      ('a1', 'remA', '180000200', 'Escuela A', 'received', 'lost in transit', 'esc', '2026-11-03T10:00:00Z', 'damaged'),
      ('a2', 'remA', '180000201', 'Escuela B', 'at_cabecera', 'one box missing', NULL, NULL, NULL),
      ('b1', 'remB', '180000200', 'Escuela A', 'in_transit', NULL, NULL, NULL, NULL),
      ('c1', 'remC', '180000400', 'Escuela C', 'in_transit', NULL, NULL, NULL, NULL);
    INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity, cabecera_received_quantity, school_received_quantity) VALUES
      ('a1', 'p1', 30, 25, 20), ('a1', 'p2', 10, 10, 10), ('a2', 'p1', 10, 8, NULL),
      ('b1', 'p1', 10, NULL, NULL), ('c1', 'p1', 50, NULL, NULL);
  `)
}, 120_000)
afterAll(async () => { await client.close() })

describe('getSupervisorControl', () => {
  it('shows a supervisor only the remitos of their own cabeceras, newest first', async () => {
    const page = await getSupervisorControl(actorOf('sup1'))
    expect(page.remitos.map((r) => r.remitoId)).toEqual(['remB', 'remA'])
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
    const other = await getSupervisorControl(actorOf('sup2'))
    expect(other.remitos.map((r) => r.remitoId)).toEqual(['remC'])
  })

  it('rejects accounts without the supervisor capability', async () => {
    await expect(getSupervisorControl(actorOf('nobody'))).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(getSupervisorControl(null)).rejects.toMatchObject({ status: 403 })
  })

  it('lets booklet admins see every remito', async () => {
    const page = await getSupervisorControl(actorOf('adm', 'admin'))
    expect(page.remitos.map((r) => r.remitoId)).toEqual(['remC', 'remB', 'remA'])
  })

  it('exposes the chain: parties, signatures, quantities and shortfall per leg with null for unsigned legs', async () => {
    const page = await getSupervisorControl(actorOf('sup1'))
    const a = page.remitos.find((r) => r.remitoId === 'remA')!
    expect(a).toMatchObject({
      cabeceraCueAnexo: '180000100', cabeceraName: 'Cabecera Norte', status: 'received',
      dispatchedByName: 'Planeamiento', dispatchedAt: '2026-11-01T10:00:00.000Z',
      cabeceraReceivedByName: 'Cabecera Account', cabeceraReceivedAt: '2026-11-02T10:00:00.000Z', hasShortfall: true,
    })
    const [a1, a2] = a.lines
    expect(a1).toMatchObject({
      recipientCueAnexo: '180000200', recipientName: 'Escuela A', status: 'received',
      schoolReceivedByName: 'School Account', schoolReceivedAt: '2026-11-03T10:00:00.000Z',
      cabeceraShortfallReason: 'lost in transit', schoolShortfallReason: 'damaged',
    })
    expect(a1.items).toEqual([
      expect.objectContaining({ productId: 'p1', dispatched: 30, cabeceraReceived: 25, schoolReceived: 20, planningToCabeceraShortfall: 5, cabeceraToSchoolShortfall: 5 }),
      expect.objectContaining({ productId: 'p2', planningToCabeceraShortfall: 0, cabeceraToSchoolShortfall: 0 }),
    ])
    expect(a2.status).toBe('at_cabecera')
    expect(a2.items[0]).toMatchObject({ planningToCabeceraShortfall: 2, cabeceraToSchoolShortfall: null, schoolReceived: null })
    const b = page.remitos.find((r) => r.remitoId === 'remB')!
    expect(b.cabeceraReceivedByName).toBeNull()
    expect(b.hasShortfall).toBe(false)
    expect(b.lines[0].items[0]).toMatchObject({ dispatched: 10, cabeceraReceived: null, planningToCabeceraShortfall: null, cabeceraToSchoolShortfall: null })
  })

  it('computes summary KPIs over the whole scope', async () => {
    expect((await getSupervisorControl(actorOf('sup1'))).summary).toEqual({
      remitosPendingCabeceraReceipt: 1, linesPendingSchoolReceipt: 1,
      planningToCabeceraShortfallUnits: 7, cabeceraToSchoolShortfallUnits: 5,
    })
    expect((await getSupervisorControl(actorOf('sup2'))).summary).toEqual({
      remitosPendingCabeceraReceipt: 1, linesPendingSchoolReceipt: 0,
      planningToCabeceraShortfallUnits: 0, cabeceraToSchoolShortfallUnits: 0,
    })
  })

  it('filters by campaign and by shortfall', async () => {
    const withShortfall = await getSupervisorControl(actorOf('sup1'), { onlyWithShortfall: true })
    expect(withShortfall.remitos.map((r) => r.remitoId)).toEqual(['remA'])
    const campaign = await getSupervisorControl(actorOf('adm', 'admin'), { campaignId: 'c2' })
    expect(campaign.remitos.map((r) => r.remitoId)).toEqual(['remC'])
    expect(campaign.summary.remitosPendingCabeceraReceipt).toBe(1)
  })

  it('pages with a cursor and rejects malformed cursors and sizes', async () => {
    const first = await getSupervisorControl(actorOf('sup1'), { limit: 1 })
    expect(first.remitos.map((r) => r.remitoId)).toEqual(['remB'])
    expect(first.hasMore).toBe(true)
    const second = await getSupervisorControl(actorOf('sup1'), { limit: 1, cursor: first.nextCursor! })
    expect(second.remitos.map((r) => r.remitoId)).toEqual(['remA'])
    expect(second.hasMore).toBe(false)
    await expect(getSupervisorControl(actorOf('sup1'), { cursor: 'garbage' })).rejects.toMatchObject({ status: 400, code: 'invalid_cursor' })
    await expect(getSupervisorControl(actorOf('sup1'), { limit: 0 })).rejects.toMatchObject({ status: 400 })
  })
})

describe('addRemitoObservation', () => {
  const count = async () => (await client.query<{ n: number }>('SELECT count(*)::int AS n FROM booklet_remito_observation')).rows[0].n

  it('persists a trimmed observation with the session author and time, visible in the control view', async () => {
    const before = await count()
    const result = await addRemitoObservation(actorOf('sup1'), 'remA', { lineId: 'a1', body: '  Follow up with the school  ' })
    expect(result).toMatchObject({ remitoId: 'remA', lineId: 'a1', authorUserId: 'sup1', authorName: 'Supervisor One', body: 'Follow up with the school' })
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false)
    expect(await count()).toBe(before + 1)
    const a = (await getSupervisorControl(actorOf('sup1'))).remitos.find((r) => r.remitoId === 'remA')!
    expect(a.observations).toEqual([expect.objectContaining({ id: result.id, authorName: 'Supervisor One', body: 'Follow up with the school', lineId: 'a1' })])
  })

  it('never changes quantities or remito state', async () => {
    const snapshot = async () => JSON.stringify([
      (await client.query('SELECT * FROM booklet_remito ORDER BY id')).rows,
      (await client.query('SELECT * FROM booklet_remito_line ORDER BY id')).rows,
      (await client.query('SELECT * FROM booklet_remito_item ORDER BY line_id, product_id')).rows,
    ])
    const before = await snapshot()
    await addRemitoObservation(actorOf('sup1'), 'remB', { body: 'Still pending' })
    expect(await snapshot()).toBe(before)
  })

  it('rejects a supervisor outside the remito scope and writes nothing', async () => {
    const before = await count()
    await expect(addRemitoObservation(actorOf('sup2'), 'remA', { body: 'x' })).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(addRemitoObservation(actorOf('sup1'), 'missing', { body: 'x' })).rejects.toMatchObject({ status: 403 })
    expect(await count()).toBe(before)
  })

  it('rejects accounts without the supervisor capability and admins', async () => {
    const before = await count()
    await expect(addRemitoObservation(actorOf('nobody'), 'remA', { body: 'x' })).rejects.toMatchObject({ status: 403 })
    await expect(addRemitoObservation(actorOf('adm', 'admin'), 'remA', { body: 'x' })).rejects.toMatchObject({ status: 403 })
    expect(await count()).toBe(before)
  })

  it('rejects blank and oversized bodies', async () => {
    const before = await count()
    await expect(addRemitoObservation(actorOf('sup1'), 'remA', { body: '   ' })).rejects.toMatchObject({ status: 400, code: 'invalid_observation' })
    await expect(addRemitoObservation(actorOf('sup1'), 'remA', { body: 'x'.repeat(2001) })).rejects.toMatchObject({ status: 400, code: 'invalid_observation' })
    await addRemitoObservation(actorOf('sup1'), 'remA', { body: 'x'.repeat(2000) })
    expect(await count()).toBe(before + 1)
  })

  it('rejects a line that belongs to another remito', async () => {
    const before = await count()
    await expect(addRemitoObservation(actorOf('sup1'), 'remA', { lineId: 'b1', body: 'x' })).rejects.toMatchObject({ status: 400, code: 'invalid_line' })
    await expect(addRemitoObservation(actorOf('sup1'), 'remA', { lineId: 'nope', body: 'x' })).rejects.toMatchObject({ status: 400, code: 'invalid_line' })
    expect(await count()).toBe(before)
  })
})
