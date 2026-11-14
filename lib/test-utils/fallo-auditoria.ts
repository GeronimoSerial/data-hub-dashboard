import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

export async function conFalloAuditoria<T>(ejecutar: () => Promise<T>): Promise<T> {
  const db = getDb()
  await db.execute(sql`CREATE OR REPLACE FUNCTION test_auditoria_falla() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo simulado'; END $$`)
  await db.execute(sql`CREATE TRIGGER test_auditoria_falla BEFORE INSERT ON auditoria_evento FOR EACH ROW EXECUTE FUNCTION test_auditoria_falla()`)
  try { return await ejecutar() }
  finally { await db.execute(sql`DROP TRIGGER test_auditoria_falla ON auditoria_evento`) }
}
