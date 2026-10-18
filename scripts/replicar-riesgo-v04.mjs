#!/usr/bin/env node
import { Pool } from 'pg'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
import { replicarRiesgoV04, validarDestinosRiesgoV04 } from './lib/replicacion-riesgo-v04.mjs'

const conexiones = [], pools = []
try {
  const source = process.env.RIESGO_SOURCE_DATABASE_URL
  const target = process.env.DATABASE_URL
  validarDestinosRiesgoV04(source, target)
  registerTsResolver(new URL('..', import.meta.url).pathname)
  const { buildPgPoolConfig } = await import('../lib/db/config-postgres.ts')
  for (const url of [source, target]) {
    const pool = new Pool({ ...buildPgPoolConfig(url), max: 1, statement_timeout: 300000 })
    pools.push(pool)
    conexiones.push(await pool.connect())
  }
  const [origen, destino] = conexiones
  const sourceDb = (await origen.query('SELECT current_database() db')).rows[0].db
  const targetDb = (await destino.query('SELECT current_database() db')).rows[0].db
  if (sourceDb !== 'hub_prod' || !['hub_staging', 'hub_dev'].includes(targetDb)
    || `/${targetDb}` !== decodeURIComponent(new URL(target).pathname)) throw new Error('Destinos incorrectos')
  console.log(JSON.stringify(await replicarRiesgoV04(origen, destino)))
} catch {
  console.error('No se pudo replicar la evaluación completa v0.4; revisar destinos, cobertura y permisos (credenciales omitidas)')
  process.exitCode = 1
} finally {
  for (const conexion of conexiones) conexion.release()
  await Promise.all(pools.map(pool => pool.end()))
}
