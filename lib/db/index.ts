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

let _db: Db | null = null

// DB1/F2: `PgDatabase` (el tipo erasado `Db`) no expone `$client`: esa
// propiedad es específica de las subclases concretas (`NodePgDatabase` /
// `PgliteDatabase`). Los call sites que necesitan el cliente crudo para
// `crearEjecutorSql()` (o para pasarlo directo a helpers de GE) lo obtienen
// por acá, sin depender del tipo `Db`.
let _rawClient: Pool | PGlite | null = null

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
export function getDb(_opciones?: OpcionesGetDb) {
  if (_db) return _db

  if (resolveDriver() === 'postgres') {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL es obligatoria cuando el driver es postgres')
    }
    const pool = new Pool(buildPgPoolConfig(connectionString))
    _rawClient = pool
    _db = drizzlePg(pool, { schema }) as unknown as Db
    return _db
  }

  const dataDirPglite = process.env.PGLITE_DATA_DIR
  const pglite = dataDirPglite
    ? new PGlite(dataDirPglite)
    : process.env.VITEST
      ? new PGlite()
      : new PGlite(getPglitePath())
  _rawClient = pglite
  _db = drizzlePglite(pglite, { schema }) as unknown as Db
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
export async function migrarDb(): Promise<void> {
  const db = getDb()
  if (resolveDriver() === 'postgres') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db as NodePgDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder: './drizzle' })
  }
}
