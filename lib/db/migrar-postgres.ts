import type { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from './schema'

// Stable across releases and replicas; session lock survives the migrator's transactions.
const MIGRATION_LOCK = '714063327005909001'

export async function migrarPostgres(pool: Pool): Promise<void> {
  const client = await pool.connect()
  let descartar = true
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK])
    try {
      await migrate(drizzle(client, { schema }), { migrationsFolder: './drizzle' })
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK])
      descartar = false
    }
  } finally {
    // A failed unlock must not return a potentially locked session to the pool.
    client.release(descartar)
  }
}
