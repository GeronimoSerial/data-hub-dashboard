// Fuente de lectura de `hazard_forecast`. En staging/dev no se copia la tabla
// (24 GB): si HAZARD_SOURCE_DATABASE_URL está definida, las lecturas de esa
// tabla van a esa base por un pool propio, de sólo lectura. Sin la variable,
// devuelve la base principal (comportamiento por defecto sin cambios).
import { Pool, type PoolConfig } from 'pg'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { buildPgPoolConfig } from './config-postgres'
import { getDb } from './index'
import * as schema from './schema'

const MAX_CONEXIONES_HAZARD = 3
const STATEMENT_TIMEOUT_HAZARD_MS = 15_000

type Db = ReturnType<typeof getDb>

// Configuración del pool de la fuente read-only. La opción de sesión
// `default_transaction_read_only` hace que cualquier escritura falle en el
// servidor, no sólo por convención del código.
export function configuracionHazardSource(connectionString: string): PoolConfig {
  return {
    ...buildPgPoolConfig(connectionString),
    max: MAX_CONEXIONES_HAZARD,
    statement_timeout: STATEMENT_TIMEOUT_HAZARD_MS,
    options: '-c default_transaction_read_only=on',
  }
}

const CACHE_HAZARD_KEY = Symbol.for('enos.hazard-source-db')

function obtenerCacheHazard(): Map<string, Db> {
  const globalConCache = globalThis as typeof globalThis & {
    [claveSimbolo: symbol]: Map<string, Db> | undefined
  }
  const existente = globalConCache[CACHE_HAZARD_KEY]
  if (existente) return existente
  const nueva = new Map<string, Db>()
  globalConCache[CACHE_HAZARD_KEY] = nueva
  return nueva
}

export function getHazardDb(): Db {
  const connectionString = process.env.HAZARD_SOURCE_DATABASE_URL
  if (!connectionString) return getDb()

  if (connectionString === process.env.DATABASE_URL) {
    throw new Error('HAZARD_SOURCE_DATABASE_URL no puede ser igual a DATABASE_URL')
  }

  const cache = obtenerCacheHazard()
  const cacheada = cache.get(connectionString)
  if (cacheada) return cacheada

  const pool = new Pool(configuracionHazardSource(connectionString))
  const db = drizzlePg(pool, { schema }) as unknown as Db
  cache.set(connectionString, db)
  return db
}
