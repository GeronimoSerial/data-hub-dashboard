import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, it } from 'vitest'

const REMITO_MIGRATION = '0062_booklet_remitos'

async function migrationsBefore(tag: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'booklet-remito-migrations-'))
  await cp('./drizzle', dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
  const index = journal.entries.findIndex((entry) => entry.tag === tag)
  if (index < 0) throw new Error(`migration ${tag} not found`)
  journal.entries = journal.entries.slice(0, index)
  await writeFile(journalPath, JSON.stringify(journal))
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

async function seedHistory(client: PGlite) {
  await client.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('u1', 'Actor', 'actor@example.test', true, now(), now());
    INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
      VALUES ('c1', 'Campaign', 'active', true, false);
    INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ('p1', 'Primero', 'primaria', '1');
    INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
      cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at)
      VALUES ('180000100', 'Cabecera', 'cabecera', 'Supervisor', 'u1', '180000100', 'u1',
        '[{"sourceId":"test","location":"row 1"}]', 'u1', now());
    INSERT INTO booklet_request (id, campaign_id, recipient_cue_anexo, cabecera_cue_anexo, status, created_by_user_id,
      approved_by_user_id, approved_at)
      VALUES ('r1', 'c1', '180000200', '180000100', 'approved', 'u1', 'u1', now());
    INSERT INTO booklet_stock_movement (id, campaign_id, product_id, quantity, movement, idempotency_key, request_id, actor_user_id)
      VALUES ('m-initial', 'c1', 'p1', 50, 'initial', 'k-initial', NULL, 'u1'),
             ('m-approval', 'c1', 'p1', 10, 'approval', 'k-approval', 'r1', 'u1');
  `)
}

async function insertRemito(client: PGlite) {
  await client.exec(`
    INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
      VALUES ('rem1', 'c1', '180000100', 'dispatched', 'u1', now());
    INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, status)
      VALUES ('line1', 'rem1', '180000200', 'in_transit');
    INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity) VALUES ('line1', 'p1', 30);
  `)
}

describe('booklet remito schema (migration 0062)', () => {
  it('upgrades a database with request-era history without losing or invalidating rows', async () => {
    const { dir, cleanup } = await migrationsBefore(REMITO_MIGRATION)
    const client = new PGlite()
    try {
      await migrate(drizzle(client), { migrationsFolder: dir })
      await seedHistory(client)
      await migrate(drizzle(client), { migrationsFolder: './drizzle' })

      const movements = await client.query<{ id: string; movement: string; request_id: string | null; remito_id: string | null }>(
        'SELECT id, movement, request_id, remito_id FROM booklet_stock_movement ORDER BY id',
      )
      expect(movements.rows).toEqual([
        { id: 'm-approval', movement: 'approval', request_id: 'r1', remito_id: null },
        { id: 'm-initial', movement: 'initial', request_id: null, remito_id: null },
      ])
      const requests = await client.query<{ id: string; status: string }>('SELECT id, status FROM booklet_request')
      expect(requests.rows).toEqual([{ id: 'r1', status: 'approved' }])
    } finally {
      await client.close()
      await cleanup()
    }
  }, 120_000)

  it('binds dispatch movements to a remito and rejects unbound or mixed bindings', async () => {
    const client = new PGlite()
    try {
      await migrate(drizzle(client), { migrationsFolder: './drizzle' })
      await seedHistory(client)
      await insertRemito(client)

      await client.exec(`INSERT INTO booklet_stock_movement (id, campaign_id, product_id, quantity, movement, idempotency_key, remito_id, actor_user_id)
        VALUES ('m-dispatch', 'c1', 'p1', 30, 'dispatch', 'k-dispatch', 'rem1', 'u1')`)

      await expect(client.exec(`INSERT INTO booklet_stock_movement (id, campaign_id, product_id, quantity, movement, idempotency_key, actor_user_id)
        VALUES ('m-bad1', 'c1', 'p1', 1, 'dispatch', 'k-bad1', 'u1')`)).rejects.toThrow(/booklet_stock_movement_binding_check/)
      await expect(client.exec(`INSERT INTO booklet_stock_movement (id, campaign_id, product_id, quantity, movement, idempotency_key, request_id, remito_id, actor_user_id)
        VALUES ('m-bad2', 'c1', 'p1', 1, 'approval', 'k-bad2', 'r1', 'rem1', 'u1')`)).rejects.toThrow(/booklet_stock_movement_binding_check/)
      await expect(client.exec(`INSERT INTO booklet_stock_movement (id, campaign_id, product_id, quantity, movement, idempotency_key, remito_id, actor_user_id)
        VALUES ('m-bad3', 'c1', 'p1', 1, 'replenishment', 'k-bad3', 'rem1', 'u1')`)).rejects.toThrow(/booklet_stock_movement_binding_check/)
    } finally {
      await client.close()
    }
  }, 120_000)

  it('rejects received quantities above the previous leg and receipts without a signer', async () => {
    const client = new PGlite()
    try {
      await migrate(drizzle(client), { migrationsFolder: './drizzle' })
      await seedHistory(client)
      await insertRemito(client)

      await expect(client.exec(`UPDATE booklet_remito_item SET cabecera_received_quantity = 31 WHERE line_id = 'line1'`))
        .rejects.toThrow(/booklet_remito_item_cabecera_check/)
      await client.exec(`UPDATE booklet_remito_item SET school_received_quantity = 5 WHERE line_id = 'line1'`)
      await expect(client.exec(`UPDATE booklet_remito_item SET school_received_quantity = 31 WHERE line_id = 'line1'`))
        .rejects.toThrow(/booklet_remito_item_school_check/)
      await client.exec(`UPDATE booklet_remito_item SET cabecera_received_quantity = 28 WHERE line_id = 'line1'`)
      await expect(client.exec(`UPDATE booklet_remito_item SET school_received_quantity = 29 WHERE line_id = 'line1'`))
        .rejects.toThrow(/booklet_remito_item_school_check/)

      await expect(client.exec(`UPDATE booklet_remito SET status = 'received' WHERE id = 'rem1'`))
        .rejects.toThrow(/booklet_remito_receipt_signature_check/)
      await expect(client.exec(`UPDATE booklet_remito_line SET status = 'received' WHERE id = 'line1'`))
        .rejects.toThrow(/booklet_remito_line_school_signature_check/)
      await expect(client.exec(`UPDATE booklet_remito_line SET cabecera_shortfall_reason = '   ' WHERE id = 'line1'`))
        .rejects.toThrow(/booklet_remito_line_cabecera_reason_check/)
    } finally {
      await client.close()
    }
  }, 120_000)
})

describe('booklet remito direct mode (migration 0063)', () => {
  const MODO_MIGRATION = '0063_booklet_remito_modo'

  async function migratedClient() {
    const client = new PGlite()
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
    await seedHistory(client)
    return client
  }

  it('marks remitos created before 0063 as cabecera remitos without changing their data', async () => {
    const { dir, cleanup } = await migrationsBefore(MODO_MIGRATION)
    const client = new PGlite()
    try {
      await migrate(drizzle(client), { migrationsFolder: dir })
      await seedHistory(client)
      await insertRemito(client)
      await migrate(drizzle(client), { migrationsFolder: './drizzle' })

      const remitos = await client.query<{ id: string; modo: string; cabecera_cue_anexo: string | null; status: string }>(
        'SELECT id, modo, cabecera_cue_anexo, status FROM booklet_remito ORDER BY id',
      )
      expect(remitos.rows).toEqual([{ id: 'rem1', modo: 'cabecera', cabecera_cue_anexo: '180000100', status: 'dispatched' }])
    } finally {
      await client.close()
      await cleanup()
    }
  }, 120_000)

  it('rejects a direct remito that still names a cabecera', async () => {
    const client = await migratedClient()
    try {
      await expect(client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, modo, dispatched_by_user_id, dispatched_at)
        VALUES ('rem-d1', 'c1', '180000100', 'dispatched', 'directo', 'u1', now())`))
        .rejects.toThrow(/booklet_remito_modo_check/)
    } finally {
      await client.close()
    }
  }, 120_000)

  it('rejects a cabecera remito without a cabecera', async () => {
    const client = await migratedClient()
    try {
      await expect(client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, modo, dispatched_by_user_id, dispatched_at)
        VALUES ('rem-c1', 'c1', NULL, 'dispatched', 'cabecera', 'u1', now())`))
        .rejects.toThrow(/booklet_remito_modo_check/)
    } finally {
      await client.close()
    }
  }, 120_000)

  it('lets a direct remito without a cabecera be received with no cabecera signer', async () => {
    const client = await migratedClient()
    try {
      await client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, modo, dispatched_by_user_id, dispatched_at)
        VALUES ('rem-d2', 'c1', NULL, 'dispatched', 'directo', 'u1', now())`)
      await client.exec(`UPDATE booklet_remito SET status = 'received' WHERE id = 'rem-d2'`)

      const remitos = await client.query<{ status: string; cabecera_received_by_user_id: string | null }>(
        `SELECT status, cabecera_received_by_user_id FROM booklet_remito WHERE id = 'rem-d2'`,
      )
      expect(remitos.rows).toEqual([{ status: 'received', cabecera_received_by_user_id: null }])
    } finally {
      await client.close()
    }
  }, 120_000)

  it('checks direct item school quantities against the dispatched quantity', async () => {
    const client = await migratedClient()
    try {
      await client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, modo, dispatched_by_user_id, dispatched_at)
        VALUES ('rem-d3', 'c1', NULL, 'dispatched', 'directo', 'u1', now());
        INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, status)
          VALUES ('line-d3', 'rem-d3', '180000200', 'in_transit');
        INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity) VALUES ('line-d3', 'p1', 30);`)

      await client.exec(`UPDATE booklet_remito_item SET school_received_quantity = 30 WHERE line_id = 'line-d3'`)
      await expect(client.exec(`UPDATE booklet_remito_item SET school_received_quantity = 31 WHERE line_id = 'line-d3'`))
        .rejects.toThrow(/booklet_remito_item_school_check/)
    } finally {
      await client.close()
    }
  }, 120_000)

  it('keeps cabecera remitos from being received without a cabecera signer', async () => {
    const client = await migratedClient()
    try {
      await client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
        VALUES ('rem-c2', 'c1', '180000100', 'dispatched', 'u1', now())`)
      await expect(client.exec(`UPDATE booklet_remito SET status = 'received' WHERE id = 'rem-c2'`))
        .rejects.toThrow(/booklet_remito_receipt_signature_check/)
    } finally {
      await client.close()
    }
  }, 120_000)
})
