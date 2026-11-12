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

// Shared lock identity for booklet approvals and source-table statement triggers.
// The values are intentionally stable across the migration and runtime bootstrap.
export const BOOKLET_ELIGIBILITY_LOCK_CLASS = 1129660740
export const BOOKLET_ELIGIBILITY_LOCK_OBJECT = 1162625351
const geSchemaReadyBrand: unique symbol = Symbol('ge-schema-ready')
export type GeSchemaReady = { readonly [geSchemaReadyBrand]: true }

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

// Referencia (no enumerable) al cliente crudo con el que se construyó un
// EjecutorSql. Permite que una operación que necesita atomicidad real (por
// ejemplo activarCorte) reserve una conexión dedicada del pool sin cambiar la
// firma que ya usan los llamadores, que sólo tienen el EjecutorSql.
const RAW_DEL_EJECUTOR = Symbol.for('mec.ge-db.raw')

export function rawDeEjecutor(client: EjecutorSql): EjecutorSqlRaw | undefined {
  return (client as unknown as Record<symbol, EjecutorSqlRaw | undefined>)[RAW_DEL_EJECUTOR]
}

export function crearEjecutorSql(raw: EjecutorSqlRaw): EjecutorSql {
  const ejecutor: EjecutorSql = {
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
  Object.defineProperty(ejecutor, RAW_DEL_EJECUTOR, { value: raw, enumerable: false })
  return ejecutor
}

// DB1/B1: ejecuta `fn` dentro de una transacción real (BEGIN/COMMIT) sobre la
// MISMA sesión, con ROLLBACK ante cualquier error. Es lo que devuelve la
// atomicidad por lote al import de padrón: si el lote falla a mitad, no queda
// un import parcial en autocommit.
//
// - pg.Pool: hay que reservar una conexión física con .connect() porque cada
//   query del pool puede salir en una conexión distinta; sin reservar, BEGIN y
//   COMMIT no comparten sesión y no hay transacción. Al terminar, release().
// - PGlite: es una sola conexión siempre, sin .connect(); se usa directo.
// - drizzle-like: NO soportado a propósito. Mezclar un tx de drizzle con un
//   cliente crudo es exactamente el patrón que causó el deadlock de PGlite
//   documentado arriba; para ese caso va db.transaction() de drizzle.
export async function ejecutarEnTransaccion<T>(
  raw: EjecutorSqlRaw,
  fn: (tx: EjecutorSql) => Promise<T>,
): Promise<T> {
  if (esDrizzleLike(raw)) {
    throw new Error(
      'ejecutarEnTransaccion no soporta clientes drizzle-like; usá db.transaction() de drizzle',
    )
  }

  const reservaConexion = typeof (raw as { connect?: unknown }).connect === 'function'
  const conn = reservaConexion
    ? await (raw as unknown as { connect: () => Promise<EjecutorDriverLike> }).connect()
    : raw
  const tx = crearEjecutorSql(conn)
  try {
    await tx.execute('BEGIN')
    const resultado = await fn(tx)
    await tx.execute('COMMIT')
    return resultado
  } catch (err) {
    await tx.execute('ROLLBACK').catch(() => {})
    throw err
  } finally {
    if (reservaConexion) {
      ;(conn as unknown as { release: () => void }).release()
    }
  }
}

// Transacción sobre una conexión DEDICADA a partir de lo que tenga el
// llamador: un EjecutorSql construido con crearEjecutorSql (se recupera su
// cliente crudo), un pg.Pool/PGlite suelto, o una conexión drizzle (db o tx),
// que se resuelve con su propio .transaction(). Nunca emite BEGIN/COMMIT
// sobre el pool suelto: ahí cada sentencia puede salir por una conexión
// distinta y la "transacción" no existe.
export async function ejecutarEnTransaccionDedicada<T>(
  destino: EjecutorSql | EjecutorSqlRaw,
  fn: (tx: EjecutorSql) => Promise<T>,
): Promise<T> {
  const raw = rawDeEjecutor(destino as EjecutorSql) ?? (destino as EjecutorSqlRaw)
  if (esDrizzleLike(raw)) {
    const conTransaccion = raw as unknown as {
      transaction?: (cb: (tx: EjecutorDrizzleLike) => Promise<T>) => Promise<T>
    }
    if (typeof conTransaccion.transaction !== 'function') {
      throw new Error(
        'Se necesita un ejecutor creado con crearEjecutorSql o un cliente crudo para abrir una transacción dedicada',
      )
    }
    return conTransaccion.transaction((tx) => fn(crearEjecutorSql(tx)))
  }
  return ejecutarEnTransaccion(raw, fn)
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
    ge_section_id BIGINT NOT NULL,
    cue_anexo TEXT NOT NULL,
    curso TEXT NOT NULL,
    division TEXT NOT NULL,
    nivel TEXT NOT NULL,
    turno TEXT NOT NULL,
    PRIMARY KEY (corte_id, ge_section_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_alumno_seccion (
    corte_id INTEGER NOT NULL,
    ge_section_id BIGINT NOT NULL,
    ge_person_id BIGINT NOT NULL,
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
  // Catálogo de niveles jurisdiccionales de GE (1 Secundario, 2 Privada, ...)
  // y, por CUE-anexo, el nivel que GE le asigna en el ciclo importado. Ambas
  // tablas se pueblan en el import de padrón desde Postgres; el import HTML no
  // las toca. Van antes de los índices porque ge_escuela_nivel_jur referencia
  // al catálogo.
  `CREATE TABLE IF NOT EXISTS ge.ge_nivel_jurisdiccional (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_escuela_nivel_jur (
    cue_anexo TEXT PRIMARY KEY,
    nivel_jurisdiccional_id INTEGER NOT NULL REFERENCES ge.ge_nivel_jurisdiccional(id),
    ciclo_lectivo INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ge.ge_alumno_identidad (
    ge_person_id BIGINT PRIMARY KEY,
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

// Lock de bootstrap: serializa entre procesos y servidores el DDL de GE
// (schema, tablas, función guard y triggers). Sin él, dos arranques concurrentes
// sobre una base fresca chocan en CREATE SCHEMA/TABLE, y CREATE OR REPLACE
// FUNCTION sobre la misma función falla con "tuple concurrently updated".
const GE_BOOTSTRAP_LOCK_CLASS = 1196445508
const GE_BOOTSTRAP_LOCK_OBJECT = 1196445509

// Cuerpo de la función guard, tal cual lo guarda Postgres en pg_proc.prosrc
// (el texto entre los $$). Es la única fuente: se usa tanto para el CREATE como
// para comparar contra prosrc. No modificar sin una migración de la función.
const CUERPO_GUARD_ELIGIBILITY = [
  '',
  '    BEGIN',
  `      PERFORM pg_advisory_xact_lock(${BOOKLET_ELIGIBILITY_LOCK_CLASS}, ${BOOKLET_ELIGIBILITY_LOCK_OBJECT});`,
  '      RETURN NULL;',
  '    END;',
  '    ',
].join('\n')

const CREATE_GUARD_ELIGIBILITY = `CREATE OR REPLACE FUNCTION public.booklet_eligibility_source_write_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$${CUERPO_GUARD_ELIGIBILITY}$$`

const SQL_PROSRC_GUARD_ELIGIBILITY = `SELECT p.prosrc FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'booklet_eligibility_source_write_guard'`

// Bootstrap memoizado por identidad de cliente crudo (pool, PGlite o tx de
// drizzle). Una entrada fallida se borra para que el siguiente llamado reintente.
const bootstrapPorCliente = new WeakMap<object, Promise<void>>()

function claveDeCliente(client: EjecutorSql): object {
  return (rawDeEjecutor(client) ?? client) as object
}

export async function ensureGeSchema(client: EjecutorSql): Promise<GeSchemaReady> {
  const clave = claveDeCliente(client)
  let listo = bootstrapPorCliente.get(clave)
  if (!listo) {
    const nuevo = bootstrapGeSchema(client)
    bootstrapPorCliente.set(clave, nuevo)
    nuevo.catch(() => {
      if (bootstrapPorCliente.get(clave) === nuevo) bootstrapPorCliente.delete(clave)
    })
    listo = nuevo
  }
  await listo
  return Object.freeze({ [geSchemaReadyBrand]: true })
}

// Test-only: olvida el bootstrap memoizado de este cliente para forzar una
// nueva pasada contra la base.
export function __resetGuardCacheForTests(client: EjecutorSql): void {
  bootstrapPorCliente.delete(claveDeCliente(client))
}

// Corre todo el DDL dentro de una transacción dedicada que primero toma el lock
// de bootstrap. Con PGlite (una sola conexión) ejecutarEnTransaccion usa BEGIN
// directo sobre la misma sesión; con pg.Pool reserva una conexión propia.
async function bootstrapGeSchema(client: EjecutorSql): Promise<void> {
  await ejecutarEnTransaccionDedicada(client, async (tx) => {
    await tx.execute(
      `SELECT pg_advisory_xact_lock(${GE_BOOTSTRAP_LOCK_CLASS}, ${GE_BOOTSTRAP_LOCK_OBJECT})`,
    )
    for (const stmt of GE_DDL) {
      await tx.execute(stmt)
    }
    await ensureEligibilitySourceGuard(tx)
  })
}

async function ensureEligibilitySourceGuard(tx: EjecutorSql): Promise<void> {
  const existente = await tx.execute(SQL_PROSRC_GUARD_ELIGIBILITY)
  const prosrc = existente.rows.length > 0 ? (existente.rows[0].prosrc as string) : undefined
  if (prosrc !== CUERPO_GUARD_ELIGIBILITY) {
    await tx.execute(CREATE_GUARD_ELIGIBILITY)
  }
  for (const table of ['ge_corte', 'ge_seccion', 'ge_alumno_seccion', 'ge_localizacion']) {
    await tx.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'ge.${table}'::regclass
            AND tgname = 'booklet_eligibility_source_guard'
            AND NOT tgisinternal
        ) THEN
          BEGIN
            CREATE TRIGGER booklet_eligibility_source_guard
            BEFORE INSERT OR UPDATE OR DELETE ON ge.${table}
            FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
          EXCEPTION WHEN duplicate_object THEN
            NULL;
          END;
        END IF;
      END;
      $$
    `)
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

// Pasa `corteId` de 'importando' a 'vigente' y el vigente anterior a
// 'historico', todo en UNA transacción sobre una conexión dedicada
// (pool.connect() + release en finally, vía ejecutarEnTransaccionDedicada).
// Antes se emitía BEGIN/COMMIT sobre el pool suelto: cada sentencia podía
// salir por una conexión distinta y un fallo entre los dos UPDATE dejaba el
// hub sin corte vigente (o con dos). El LOCK serializa activaciones
// concurrentes; las validaciones corren dentro de la misma transacción,
// contra el mismo estado que se va a modificar.
export async function activarCorte(client: EjecutorSql | EjecutorSqlRaw, corteId: number): Promise<void> {
  await ejecutarEnTransaccionDedicada(client, async (tx) => {
    await tx.execute('LOCK TABLE ge.ge_corte IN SHARE ROW EXCLUSIVE MODE')
    const corte = await tx.execute({
      sql: 'SELECT id, estado FROM ge.ge_corte WHERE id = ? FOR UPDATE',
      args: [corteId],
    })
    if (corte.rows.length === 0) {
      throw new Error(`Corte ${corteId} no existe`)
    }
    const estado = corte.rows[0].estado as string
    if (estado !== 'importando') {
      throw new Error(`Corte ${corteId} no está en estado 'importando'`)
    }

    const seccionesSinLocalizacion = await tx.execute({
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

    const membresiasHuerfanas = await tx.execute({
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

    await tx.execute({
      sql: "UPDATE ge.ge_corte SET estado = 'historico' WHERE estado = 'vigente' AND id != ?",
      args: [corteId],
    })
    await tx.execute({ sql: "UPDATE ge.ge_corte SET estado = 'vigente' WHERE id = ?", args: [corteId] })
  })
}
