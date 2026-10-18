#!/usr/bin/env node
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())
const source = process.env.PREFECTURA_SOURCE_DATABASE_URL
const target = process.env.DATABASE_URL
const DESTINOS = { hub_staging: 'staging', hub_dev: 'dev' }
const dbDestino = target ? new URL(target).pathname.slice(1) : ''
if (!source || !target || new URL(source).pathname !== '/hub_prod' || !Object.hasOwn(DESTINOS, dbDestino)) {
  console.error('La entrega requiere origen hub_prod y destino hub_staging o hub_dev'); process.exit(1)
}
const { buildPgPoolConfig } = await import('../lib/db/config-postgres.ts')
const { getDb, getRawClient, migrarDb } = await import('../lib/db/index.ts')
const { entregarPrefectura } = await import('../lib/infraestructura/hidrometria/replicacion.ts')
const schema = await import('../lib/db/schema.ts')
const pool = new Pool({ ...buildPgPoolConfig(source), connectionTimeoutMillis: 10000, statement_timeout: 120000 })
try {
  const origen = await pool.query('SELECT current_database() AS db')
  const destino = await getRawClient().query('SELECT current_database() AS db')
  if (origen.rows[0].db !== 'hub_prod' || destino.rows[0].db !== dbDestino) throw new Error('Entornos incorrectos')
  await migrarDb()
  const resultado = await entregarPrefectura(drizzle(pool, { schema }), getDb(), new Date(), 50, DESTINOS[dbDestino])
  console.log(JSON.stringify(resultado))
  process.exitCode = resultado.fallidas ? 1 : 0
} catch {
  console.error('No se pudo procesar la entrega de Prefectura; revisar conexiones y migraciones')
  process.exitCode = 1
} finally { await pool.end(); await getRawClient().end() }
