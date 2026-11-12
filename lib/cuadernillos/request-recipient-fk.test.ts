import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, it } from 'vitest'

describe('booklet_request recipient binding', () => {
  it('does not require the recipient school to have an assignment row', async () => {
    const client = new PGlite()
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
    const { rows } = await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'booklet_request'::regclass AND contype = 'f'`,
    )
    const defs = rows.map((row) => row.def)
    expect(defs.some((def) => def.startsWith('FOREIGN KEY (recipient_cue_anexo)'))).toBe(false)
    expect(defs.some((def) => def.startsWith('FOREIGN KEY (cabecera_cue_anexo)'))).toBe(true)
    await client.close()
  }, 120_000)
})
