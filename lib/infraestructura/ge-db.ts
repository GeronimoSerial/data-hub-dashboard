import { createClient, type Client } from '@libsql/client'
import path from 'node:path'
import { sql as sqlDrizzle, type SQL, type SQLWrapper } from 'drizzle-orm'
import { getDataDir } from '../data-dir'
import type { GeCorte } from './types'

// Ejecutor SQL mínimo compartido por ge-db.ts, impacto.ts e identidad.ts.
// Se construye con crearEjecutorSql(raw), donde `raw` puede ser:
// - "driver-like": un pg.Pool (drizzle-orm/node-postgres) o una PGlite
//   (drizzle-orm/pglite) sueltos. Ambos exponen query(text, params).
// - "drizzle-like": la conexión de Drizzle "suelta" (getDb()) o el `tx` que
//   entrega db.transaction(async (tx) => ...). Ambos exponen execute(query),
//   que corre sobre la MISMA sesión que sostiene la transacción. Usar esto
//   dentro de un callback de db.transaction() es la forma de leer el schema
//   `ge` sin caer en el deadlock de PGlite (ver comentario en impacto.ts y
//   app/api/problematicas/parte/route.ts): el cliente pool/raw separado queda
//   encolado detrás del COMMIT mientras el callback lo espera.
export interface EjecutorSql {
  execute(query: string | { sql: string; args?: unknown[] }): Promise<{ rows: Record<string, unknown>[] }>
}

interface EjecutorDriverLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

interface EjecutorDrizzleLike {
  // Firma real de PgDatabase/PgTransaction.execute (drizzle-orm/pg-core):
  // recibe un SQLWrapper o un string y devuelve un thenable (PgRaw). Se tipa
  // con PromiseLike para que el `tx` concreto sea asignable.
  execute: (query: SQLWrapper | string) => PromiseLike<unknown>
}

export type EjecutorSqlRaw = EjecutorDriverLike | EjecutorDrizzleLike

// Drizzle expone `.execute` Y `.query` (este último es el objeto de relational
// queries, no la función del driver). Por eso `'query' in raw` NO sirve como
// discriminador: el chequeo confiable es `execute` es función y `query` no lo
// es. Verificado contra PGlite suelto (query función, sin execute) y contra el
// `db`/`tx` de drizzle-orm/pglite (execute función, query objeto).
function esDrizzleLike(raw: EjecutorSqlRaw): raw is EjecutorDrizzleLike {
  const candidato = raw as { execute?: unknown; query?: unknown }
  return typeof candidato.execute === 'function' && typeof candidato.query !== 'function'
}

// Traduce los placeholders `?` posicionales (estilo SQLite/libsql, que es como
// está escrito el SQL de este módulo y de sus consumidores) a `$1, $2, ...`,
// la forma que exige Postgres. Asume que ningún `?` aparece dentro de un
// literal de string (válido para el SQL de este proyecto).
function aParametrosPg(texto: string): string {
  let n = 0
  return texto.replace(/\?/g, () => `$${++n}`)
}

// Reconstruye una query parametrizada para la API de Drizzle: interpola cada
// valor del arreglo `args` por su placeholder `?` dentro de un template sql,
// de modo que Drizzle lo parametrice (sin inyección) en vez de concatenar
// strings. Los tramos de texto crudo entre placeholders van por sql.raw.
function construirSqlDinamico(texto: string, args: unknown[] = []): SQL {
  const partes = texto.split('?')
  let acumulado: SQL = sqlDrizzle.raw(partes[0] ?? '')
  for (let i = 0; i < args.length; i++) {
    acumulado = sqlDrizzle`${acumulado}${args[i]}${sqlDrizzle.raw(partes[i + 1] ?? '')}`
  }
  return acumulado
}

export function crearEjecutorSql(raw: EjecutorSqlRaw): EjecutorSql {
  return {
    async execute(query) {
      const sqlText = typeof query === 'string' ? query : query.sql
      const args = typeof query === 'string' ? undefined : query.args

      if (esDrizzleLike(raw)) {
        // Sin argumentos (DDL, BEGIN/COMMIT, o SQL ya literal) no hay nada que
        // parametrizar: se pasa el string tal cual. Con argumentos se arma el
        // SQL dinámico con el helper `sql` de drizzle-orm.
        const resultado = (await (args && args.length > 0
          ? raw.execute(construirSqlDinamico(sqlText, args))
          : raw.execute(sqlText))) as { rows?: unknown }
        return { rows: (resultado.rows ?? resultado) as Record<string, unknown>[] }
      }

      const res = await raw.query(aParametrosPg(sqlText), args)
      return { rows: res.rows as Record<string, unknown>[] }
    },
  }
}

// TODO(DB1-F2): eliminar cuando scripts/seed-demo-partes.mjs y
// lib/infraestructura/rotacion-clave.test.ts dejen de usar ge.sqlite.
export function getGeSqlitePath(): string {
  return path.join(getDataDir(), 'ge.sqlite')
}

// DB1/F2: en Postgres las tablas de GE viven en el schema nativo `ge` de la
// MISMA base que el resto del hub (ya no hay ATTACH ni base separada).
const GE_DDL: string[] = [
  `CREATE SCHEMA IF NOT EXISTS ge`,
  `CREATE TABLE IF NOT EXISTS ge.ge_corte (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ciclo_lectivo INTEGER NOT NULL,
    fetched_at TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('importando','vigente','historico'))
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_seccion (
    corte_id INTEGER NOT NULL,
    ge_section_id INTEGER NOT NULL,
    cue_anexo TEXT NOT NULL,
    curso TEXT NOT NULL,
    division TEXT NOT NULL,
    nivel TEXT NOT NULL,
    turno TEXT NOT NULL,
    PRIMARY KEY (corte_id, ge_section_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_alumno_seccion (
    corte_id INTEGER NOT NULL,
    ge_section_id INTEGER NOT NULL,
    ge_person_id INTEGER NOT NULL,
    PRIMARY KEY (corte_id, ge_section_id, ge_person_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_localizacion (
    cue_anexo TEXT PRIMARY KEY,
    cui TEXT,
    nombre TEXT NOT NULL,
    departamento TEXT NOT NULL,
    localidad TEXT NOT NULL,
    lat REAL,
    lon REAL,
    geo_calidad TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_alumno_identidad (
    ge_person_id INTEGER PRIMARY KEY,
    payload_cifrado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ge_seccion_corte_cue ON ge.ge_seccion (corte_id, cue_anexo)`,
  `CREATE INDEX IF NOT EXISTS idx_ge_alumno_seccion_corte_section ON ge.ge_alumno_seccion (corte_id, ge_section_id)`,
]

// TODO(DB1-F2): eliminar cuando sus consumidores SQLite migren a Postgres
// (scripts/sync-ge.mjs, scripts/import-padron.mjs, app/problematicas/**,
// app/(hub)/infraestructura/cargar/page.tsx y los *.test.ts que aún abren
// ge.sqlite). En Postgres ya no hay una base separada que abrir.
export function openGeDb(): Client {
  return createClient({ url: `file:${getGeSqlitePath()}` })
}

export async function ensureGeSchema(client: EjecutorSql): Promise<void> {
  for (const stmt of GE_DDL) {
    await client.execute(stmt)
  }
}

// En SQLite ge.sqlite era una base aparte montada con
// `ATTACH DATABASE 'file:...' AS ge`. En Postgres no existe ATTACH: `ge` es un
// schema nativo de la MISMA base, y ensureGeSchema() lo crea con
// `CREATE SCHEMA IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`. Acá ya no hay
// nada que adjuntar; se re-ejecuta el DDL (idempotente) para garantizar que el
// schema exista aunque ensureSeeded() todavía no haya corrido en este proceso.
// La firma se mantiene para no romper a los llamadores de briefs posteriores.
export async function attachGe(client: EjecutorSql): Promise<void> {
  await ensureGeSchema(client)
}

export async function getCorteVigente(client: EjecutorSql): Promise<GeCorte | null> {
  const res = await client.execute(
    "SELECT id, ciclo_lectivo as \"cicloLectivo\", fetched_at as \"fetchedAt\", estado FROM ge.ge_corte WHERE estado = 'vigente' ORDER BY id DESC LIMIT 1",
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0] as unknown as GeCorte
  return row
}

export async function activarCorte(client: EjecutorSql, corteId: number): Promise<void> {
  const corte = await client.execute({ sql: 'SELECT id, estado FROM ge.ge_corte WHERE id = ?', args: [corteId] })
  if (corte.rows.length === 0) {
    throw new Error(`Corte ${corteId} no existe`)
  }
  const estado = corte.rows[0].estado as string
  if (estado !== 'importando') {
    throw new Error(`Corte ${corteId} no está en estado 'importando'`)
  }

  const seccionesSinLocalizacion = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM ge.ge_seccion s
     WHERE s.corte_id = ? AND NOT EXISTS (
       SELECT 1 FROM ge.ge_localizacion l WHERE l.cue_anexo = s.cue_anexo
     )`,
    args: [corteId],
  })
  const seccionesFallan = Number(seccionesSinLocalizacion.rows[0].n)
  if (seccionesFallan > 0) {
    throw new Error(`${seccionesFallan} secciones referencian cue_anexo inexistente en ge_localizacion`)
  }

  const membresiasHuerfanas = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM ge.ge_alumno_seccion m
     WHERE m.corte_id = ? AND NOT EXISTS (
       SELECT 1 FROM ge.ge_seccion s WHERE s.corte_id = m.corte_id AND s.ge_section_id = m.ge_section_id
     )`,
    args: [corteId],
  })
  const membresiasFallan = Number(membresiasHuerfanas.rows[0].n)
  if (membresiasFallan > 0) {
    throw new Error(`${membresiasFallan} membresías apuntan a ge_seccion inexistente`)
  }

  // TODO(DB1-F2/F3): activarCorte necesita una conexión reservada (pool.connect()), no el pool suelto, para que BEGIN/COMMIT/ROLLBACK sean atómicos
  await client.execute('BEGIN')
  try {
    await client.execute({
      sql: "UPDATE ge.ge_corte SET estado = 'historico' WHERE estado = 'vigente' AND id != ?",
      args: [corteId],
    })
    await client.execute({ sql: "UPDATE ge.ge_corte SET estado = 'vigente' WHERE id = ?", args: [corteId] })
    await client.execute('COMMIT')
  } catch (err) {
    try {
      await client.execute('ROLLBACK')
    } catch {
      // noop: si el COMMIT ya cerró la transacción, el error original manda
    }
    throw err
  }
}