import path from 'node:path'
import { transaccionContextual } from './contexto'
import { Pool, types } from 'pg'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { getPglitePath } from '@/lib/data-dir'
import { resolveDriver } from './driver'
import { buildPgPoolConfig } from './config-postgres'
import * as schema from './schema'

// BIGINT/int8 (OID 20) vuelve como string por defecto en node-postgres para
// no perder precisión sobre 2^53. Los ids derivados por hash de DB1
// (ge_section_id/ge_person_id) nunca superan 48 bits, así que es seguro
// parsearlos como number; evita que el resto del código tenga que manejar
// string vs number para estas columnas. PGlite ya devuelve number nativo,
// este parser sólo aplica al driver `pg`.
types.setTypeParser(types.builtins.INT8, (val) => parseInt(val, 10))

// DB1/F2: `NodePgDatabase` (postgres) y `PgliteDatabase` (pglite) extienden la
// misma clase base `PgDatabase`. Antes `Db` era una UNIÓN de las dos clases
// concretas, y TypeScript resolvía cada método encadenado (`.insert().values()
// .onConflictDoNothing()`, `.update().set()`, ...) como la intersección de
// firmas entre ambos miembros: eso descartaba sobrecargas válidas y producía
// errores en call sites correctos. Declarar la clase base con el resultado
// erasado (`PgQueryResultHKT`) expone una única firma compatible con ambos
// motores.
type Db = PgDatabase<PgQueryResultHKT, typeof schema>

interface EntradaCacheDb {
  db: Db
  rawClient: Pool | PGlite
  migratePromise?: Promise<void>
}

type CacheDb = Map<string, EntradaCacheDb>

// `next dev` carga las rutas de página (RSC) y `app/api/**` en grafos de
// módulos/bundles DISTINTOS dentro del MISMO proceso Node, así que un cliente
// guardado sólo en variables de módulo se duplica: cada bundle abre su propia
// PGlite sobre el MISMO directorio y eso corrompe la base (PGlite es una sola
// conexión por directorio). `globalThis` sí se comparte entre bundles, por eso
// el cache real —por path de directorio en pglite, por connectionString en
// postgres— vive ahí; `_db`/`_rawClient` quedan como atajo local y como
// fallback del caso PGlite en memoria.
const CACHE_DB_KEY = Symbol.for('enos.db')

function obtenerCacheDb(): CacheDb {
  const globalConCache = globalThis as typeof globalThis & {
    [claveSimbolo: symbol]: CacheDb | undefined
  }
  const existente = globalConCache[CACHE_DB_KEY]
  if (existente) return existente
  const nueva: CacheDb = new Map()
  globalConCache[CACHE_DB_KEY] = nueva
  return nueva
}

// Clave de cache para la configuración actual, o null cuando NO corresponde
// cachear: PGlite 100% en memoria bajo Vitest (sin PGLITE_DATA_DIR) no tiene
// clave compartible y cada archivo de test espera aislamiento total.
function claveDeCache(): string | null {
  if (resolveDriver() === 'postgres') {
    return process.env.DATABASE_URL ?? null
  }
  const dataDirPglite = process.env.PGLITE_DATA_DIR
  if (!dataDirPglite && process.env.VITEST) return null
  return path.resolve(dataDirPglite ?? getPglitePath())
}

let _db: Db | null = null

// DB1/F2: `PgDatabase` (el tipo erasado `Db`) no expone `$client`: esa
// propiedad es específica de las subclases concretas (`NodePgDatabase` /
// `PgliteDatabase`). Los call sites que necesitan el cliente crudo para
// `crearEjecutorSql()` (o para pasarlo directo a helpers de GE) lo obtienen
// por acá, sin depender del tipo `Db`.
let _rawClient: Pool | PGlite | null = null
let _migratePromise: Promise<void> | null = null

export interface OpcionesGetDb {
  // Conservado por compatibilidad con los llamadores existentes (jobs de
  // ejecución finita). Sin efecto contra Postgres/PGlite: el reintento ante
  // lock ocupado (ver lib/db/reintento.ts) es exclusivamente por backoff
  // manual, nunca por un busy timeout nativo — ni libpq ni PGlite exponen
  // uno equivalente al de @libsql/client, y no hace falta: Postgres no
  // bloquea el proceso entero como hacía SQLite en el mismo hilo.
  busyTimeoutMs?: number
}

// DB1/F2: Postgres reemplaza a SQLite por completo (ver
// docs/ejecucion-enos/DB1/registro.md — decisión de arquitectura, sin modo
// dual). `resolveDriver()` decide entre:
// - 'postgres' (DATABASE_URL=postgres(ql)://...): drizzle-orm/node-postgres
//   contra un `pg.Pool`, para producción, staging y RDS.
// - 'pglite' (sin DATABASE_URL): @electric-sql/pglite vía
//   drizzle-orm/pglite, sin ningún servicio externo ni contenedor. Bajo
//   Vitest (`process.env.VITEST`), en memoria — cada archivo de test corre
//   en su propio contexto de módulos, así que la memoización a nivel de
//   módulo de `_db` ya aísla una instancia por archivo, igual que pasaba
//   antes con el SQLite en un directorio temporal por test. Fuera de tests
//   (desarrollo local), persistida en DATA_DIR/pg para que la demo local
//   sobreviva reinicios sin depender de Docker/podman.
//
//   PGLITE_DATA_DIR (opt-in, pensado para tests) fuerza una PGlite
//   persistida en esa ruta aunque corra bajo Vitest. Lo necesita el único
//   test que simula un reinicio real de la app con `vi.resetModules()` sobre
//   la MISMA base (lib/infraestructura/recurso-seed.test.ts): con PGlite en
//   memoria, resetear los módulos crea una base vacía nueva y el dato
//   sembrado por el "proceso anterior" desaparece. Sin esta variable, el
//   resto de los tests sigue usando la PGlite en memoria de siempre.
export function getDb(_opciones?: OpcionesGetDb): Db {
  const contextual = transaccionContextual.getStore()
  if (contextual) return contextual
  if (_db) return _db

  if (resolveDriver() === 'postgres') {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL es obligatoria cuando el driver es postgres')
    }
    // Con `pg` real varios Pool contra el mismo servidor son válidos, pero
    // compartir por connectionString evita multiplicar pools entre bundles.
    const cache = obtenerCacheDb()
    const cacheado = cache.get(connectionString)
    if (cacheado) {
      _db = cacheado.db
      _rawClient = cacheado.rawClient
      return _db
    }
    const pool = new Pool(buildPgPoolConfig(connectionString))
    _db = drizzlePg(pool, { schema }) as unknown as Db
    _rawClient = pool
    cache.set(connectionString, { db: _db, rawClient: pool })
    return _db
  }

  const dataDirPglite = process.env.PGLITE_DATA_DIR
  if (!dataDirPglite && process.env.VITEST) {
    // PGlite en memoria bajo Vitest: sin directorio no hay clave compartible,
    // así que no se cachea en globalThis y cada archivo de test queda aislado.
    const pglite = new PGlite()
    _rawClient = pglite
    _db = drizzlePglite(pglite, { schema }) as unknown as Db
    return _db
  }

  const directorio = dataDirPglite ?? getPglitePath()
  const clave = path.resolve(directorio)
  const cache = obtenerCacheDb()
  const cacheado = cache.get(clave)
  if (cacheado) {
    _db = cacheado.db
    _rawClient = cacheado.rawClient
    return _db
  }
  const pglite = new PGlite(directorio)
  _db = drizzlePglite(pglite, { schema }) as unknown as Db
  _rawClient = pglite
  cache.set(clave, { db: _db, rawClient: pglite })
  return _db
}

// DB1/F2: devuelve el cliente crudo (`pg.Pool` | `PGlite`) construido junto
// con `_db`. Fuerza la construcción si todavía no se llamó a `getDb()`.
export function getRawClient(): Pool | PGlite {
  if (!_rawClient) getDb()
  return _rawClient!
}

// DB1/F2: aplica las migraciones versionadas de drizzle-kit (./drizzle)
// generadas desde lib/db/schema.ts. Reemplaza al DDL manual (HUB_DDL + los
// ensure*Column*) que antes vivía en lib/db/seed.ts. Cada motor usa su propio
// migrator: node-postgres en producción/staging, pglite (sin servicio
// externo) en tests y desarrollo local. Es idempotente: drizzle lleva su
// tabla `drizzle.__drizzle_migrations` y sólo aplica lo pendiente.
//
// La promesa se memoiza en la entrada de cache (o en `_migratePromise` para
// PGlite en memoria) para que dos bundles que llamen `migrarDb()` casi al
// mismo tiempo sobre el mismo directorio corran la migración UNA sola vez: el
// segundo espera la misma promesa en vez de disparar otra en paralelo.
export async function migrarDb(): Promise<void> {
  const db = getDb()
  const clave = claveDeCache()

  if (clave === null) {
    if (!_migratePromise) {
      const intento = correrMigracion(db)
      _migratePromise = intento
      intento.catch(() => {
        if (_migratePromise === intento) _migratePromise = null
      })
      return intento
    }
    return _migratePromise
  }

  const entrada = obtenerCacheDb().get(clave)
  if (!entrada) {
    await correrMigracion(db)
    return
  }
  if (!entrada.migratePromise) {
    const intento = correrMigracion(entrada.db)
    entrada.migratePromise = intento
    intento.catch(() => {
      if (entrada.migratePromise === intento) entrada.migratePromise = undefined
    })
    return intento
  }
  return entrada.migratePromise
}

async function correrMigracion(db: Db): Promise<void> {
  if (resolveDriver() === 'postgres') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db as NodePgDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  }
}

// Helper EXCLUSIVO de tests: `vi.resetModules()` no vacía `globalThis`, así
// que un test que simula un reinicio real de proceso debe borrar la entrada
// cacheada para forzar una recarga honesta desde la base (ver
// lib/infraestructura/recurso-seed.test.ts y
// lib/infraestructura/briefing-ia/presupuesto.test.ts). Además cierra el
// cliente viejo por defecto, como haría el cierre de un proceso real (si no,
// PGlite queda con handles abiertos sobre un directorio que el test borra
// enseguida).
//
// La clave debe coincidir EXACTAMENTE con la que usa `getDb()`: path absoluto
// del directorio para PGlite, `connectionString` tal cual para postgres. Por
// eso el helper recibe cuál de las dos es y sólo aplica `path.resolve()` en el
// caso PGlite (aplicarlo a una URL la convertiría en una ruta de archivo
// relativa al cwd que nunca matchearía la clave real), y acepta
// `cerrarCliente: false` para call sites que todavía necesitan ese cliente vivo
// (p. ej. simular dos pools físicos simultáneos).
export async function __eliminarInstanciaCacheadaParaTests(
  opciones:
    | { directorio: string; cerrarCliente?: boolean }
    | { connectionString: string; cerrarCliente?: boolean },
): Promise<void> {
  const cache = obtenerCacheDb()
  const clave =
    'directorio' in opciones
      ? path.resolve(opciones.directorio)
      : opciones.connectionString
  const entrada = cache.get(clave)
  if (!entrada) return
  cache.delete(clave)
  if (opciones.cerrarCliente === false) return
  if (typeof (entrada.rawClient as { close?: unknown }).close === 'function') {
    await (entrada.rawClient as PGlite).close()
  } else {
    await (entrada.rawClient as Pool).end()
  }
}
