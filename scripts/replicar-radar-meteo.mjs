#!/usr/bin/env node
import { Pool } from 'pg'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
import { validarDestinosRadar, replicarRadar } from './lib/replicacion-radar.mjs'

const source = process.env.RADAR_SOURCE_DATABASE_URL
const target = process.env.DATABASE_URL
const pools = [], conexiones = []
try {
  validarDestinosRadar(source, target)
  registerTsResolver(new URL('..', import.meta.url).pathname)
  const { buildPgPoolConfig } = await import('../lib/db/config-postgres.ts')
  for (const url of [source, target]) {
    const pool = new Pool({ ...buildPgPoolConfig(url), max: 1, statement_timeout: 120000 })
    pools.push(pool)
    conexiones.push(await pool.connect())
  }
  const [origen, destino] = conexiones
  const dbOrigen = (await origen.query('SELECT current_database() AS db')).rows[0].db
  const dbDestino = (await destino.query('SELECT current_database() AS db')).rows[0].db
  if (dbOrigen !== 'hub_prod' || !['hub_staging', 'hub_dev'].includes(dbDestino) ||
    `/${dbDestino}` !== decodeURIComponent(new URL(target).pathname)) throw new Error('Entornos incorrectos')
  console.log(JSON.stringify(await replicarRadar(origen, destino)))
} catch {
  console.error('No se pudo replicar el radar; revisar conexiones, destinos y esquema desplegado')
  process.exitCode = 1
} finally {
  for (const conexion of conexiones) conexion.release()
  await Promise.all(pools.map(pool => pool.end()))
}
