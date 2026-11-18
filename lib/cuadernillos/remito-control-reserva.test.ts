import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import * as schema from '@/lib/db/schema'

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
  const db = drizzle(client, { schema })
  lazyDb.target = db as unknown as Record<PropertyKey, unknown>
  await migrate(db, { migrationsFolder: './drizzle' })
  await client.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role) VALUES
      ('sup1', 'Supervisor One', 'sup1@example.test', true, now(), now(), 'consulta'),
      ('sup2', 'Supervisor Two', 'sup2@example.test', true, now(), now(), 'consulta'),
      ('plan', 'Planeamiento', 'plan@example.test', true, now(), now(), 'consulta'),
      ('cab1', 'Cabecera One', 'cab1@example.test', true, now(), now(), 'consulta'),
      ('cab2', 'Cabecera Two', 'cab2@example.test', true, now(), now(), 'consulta'),
      ('adm', 'Admin', 'adm@example.test', true, now(), now(), 'admin');
    INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
      ('m1', 'sup1', 'supervisor', 'plan'), ('m2', 'sup2', 'supervisor', 'plan');
    INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed) VALUES ('c1', 'Campaign', 'active', true, false);
    INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ('p1', 'Primero', 'primaria', '1');
    INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
      cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at) VALUES
      ('180000100', 'Cabecera Norte', 'cabecera', 'S1', 'sup1', '180000100', 'cab1', '[{"sourceId":"t","location":"1"}]', 'plan', now()),
      ('180000300', 'Cabecera Sur', 'cabecera', 'S2', 'sup2', '180000300', 'cab2', '[{"sourceId":"t","location":"1"}]', 'plan', now());
    -- reserve of cabecera 100: cabecera signed 90 of 100
    INSERT INTO booklet_remito (id, campaign_id, modo, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at, cabecera_received_by_user_id, cabecera_received_at)
      VALUES ('remR', 'c1', 'cabecera', '180000100', 'received', 'plan', '2026-11-01T10:00:00Z', 'cab1', '2026-11-02T10:00:00Z');
    INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, status, reserva) VALUES ('lr', 'remR', '180000100', 'at_cabecera', true);
    INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity, cabecera_received_quantity) VALUES ('lr', 'p1', 100, 90);
    -- onward remitos of cabecera 100 (supervised by sup1) and of cabecera 300 (sup2)
    INSERT INTO booklet_remito (id, campaign_id, modo, cabecera_cue_anexo, origen_cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
      VALUES ('remO1', 'c1', 'directo', NULL, '180000100', 'dispatched', 'cab1', '2026-11-03T10:00:00Z'),
             ('remO2', 'c1', 'directo', NULL, '180000300', 'dispatched', 'cab2', '2026-11-04T10:00:00Z');
    INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, recipient_name, status) VALUES
      ('lo1', 'remO1', '180000200', 'Escuela A', 'in_transit'), ('lo2', 'remO2', '180000400', 'Escuela C', 'in_transit');
    INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity) VALUES ('lo1', 'p1', 20), ('lo2', 'p1', 5);
  `)
}, 120_000)
afterAll(async () => { await client.close() })

describe('supervisor control with cabecera reserve sends', () => {
  it('includes onward remitos of supervised cabeceras, read-only and marked with their origin, never another supervisor\'s', async () => {
    const page = await getSupervisorControl(actorOf('sup1'))
    expect(page.remitos.map((r) => r.remitoId)).toEqual(['remO1', 'remR'])
    expect(page.remitos[0]).toMatchObject({ modo: 'directo', cabeceraCueAnexo: null, origenCabeceraCueAnexo: '180000100', origenCabeceraName: 'Cabecera Norte', dispatchedByName: 'Cabecera One' })
    expect(page.remitos[0].lines[0]).toMatchObject({ recipientCueAnexo: '180000200', reserva: false })
    expect(page.remitos[1]).toMatchObject({ origenCabeceraCueAnexo: null })
    expect(page.remitos[1].lines[0]).toMatchObject({ reserva: true, status: 'at_cabecera' })
    expect((await getSupervisorControl(actorOf('sup2'))).remitos.map((r) => r.remitoId)).toEqual(['remO2'])
    expect((await getSupervisorControl(actorOf('adm', 'admin'))).remitos.map((r) => r.remitoId)).toEqual(['remO2', 'remO1', 'remR'])
  })

  it('does not count a reserve line as waiting for a school receipt, but counts onward lines in transit', async () => {
    expect((await getSupervisorControl(actorOf('sup1'))).summary).toEqual({
      remitosPendingCabeceraReceipt: 0, linesPendingSchoolReceipt: 1,
      planningToCabeceraShortfallUnits: 10, cabeceraToSchoolShortfallUnits: 0,
    })
  })

  it('does not let a supervisor observe an onward remito: it stays read-only', async () => {
    await expect(addRemitoObservation(actorOf('sup1'), 'remO1', { body: 'x' })).rejects.toMatchObject({ status: 403 })
  })
})
