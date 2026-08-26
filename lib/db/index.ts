import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { getSqlitePath } from '@/lib/data-dir'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  const url = `file:${getSqlitePath()}`
  const client = createClient({ url })
  _db = drizzle(client, { schema })
  return _db
}
