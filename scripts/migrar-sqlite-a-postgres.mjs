#!/usr/bin/env node
/**
 * Migra los datos del SQLite operativo (hub.sqlite) y del SQLite de GE
 * (ge.sqlite) al Postgres/PGlite destino (DB1/F4).
 *
 * Uso:
 *   node scripts/migrar-sqlite-a-postgres.mjs [--pglite <dir>] [--data-dir <dir>]
 *
 * Decisión de upsert: `.onConflictDoUpdate({ target: <pk>, set: <resto> })`
 * (idempotente, converge). Se eligió DoUpdate por sobre DoNothing porque el
 * SQLite origen sigue siendo la verdad operativa durante la transición: una
 * segunda pasada debe reflejar el estado actual del origen, no dejar filas
 * desactualizadas.
 *
 * Decisión de lotes: TAMANO_LOTE = 500 (mismo valor que el motor de riesgo
 * para inserts masivos, ver lib/infraestructura/riesgo/jobs/sync-seasonal.ts)
 * y una transacción por tabla. Una transacción por tabla (no por lote) deja el
 * upsert atómico por tabla: si la tabla falla a mitad, no quedan cambios
 * parciales. El límite de parámetros de Postgres (65535) se respeta porque 500
 * filas por el máximo de columnas del schema queda holgadamente por debajo.
 *
 * El único setval real del sistema es ge.ge_corte.id (única columna identity):
 * al final se lo avanza hasta MAX(id) (o `is_called = false` si la tabla quedó
 * vacía) para que el próximo insert autogenerado no colisione.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import { createClient } from '@libsql/client'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// lib/infraestructura/ge-db.ts importa '@/lib/data-dir' y './types'. El alias
// @/ lo mapea Node vía tsconfig, pero deja la ruta sin extensión, que el
// resolver ESM no completa. Mismo hook que scripts/import-padron.mjs y
// sync-ge.mjs.
function resolveTsCandidate(base) {
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const candidate = resolveTsCandidate(join(root, specifier.slice(2)))
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    } else if (
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('/')
    ) {
      const base = specifier.startsWith('/')
        ? specifier
        : join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

import {
  COLUMNAS_GE,
  ORDEN_GE,
  PK_GE,
  TAMANO_LOTE,
  TIPOS_GE,
  compararTabla,
  convertirFila,
  formatearLineaReporte,
  ordenTopologico,
  pkDeSnapshot,
  tieneIdentidad,
} from './lib/migrar-sqlite-a-postgres.lib.mjs'

export const USO = `Uso:
  node scripts/migrar-sqlite-a-postgres.mjs [--pglite <dir>] [--data-dir <dir>]

  --pglite <dir>   Migra a una PGlite persistida en <dir> (sin servicio externo).
  --data-dir <dir> Directorio de datos de ORIGEN (default $DATA_DIR o ./.data).
  Sin --pglite usa DATABASE_URL del entorno (Postgres real), igual que getDb().`

/**
 * Parsea los argumentos del CLI. Las banderas ausentes quedan undefined para
 * que el llamador decida los defaults por entorno.
 */
export function parsearArgs(argv) {
  let pgliteDir
  let dataDir
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--pglite') {
      pgliteDir = argv[++i]
      if (!pgliteDir) throw new Error('--pglite necesita un directorio')
    } else if (arg === '--data-dir') {
      dataDir = argv[++i]
      if (!dataDir) throw new Error('--data-dir necesita un directorio')
    } else {
      throw new Error(`Argumento desconocido: ${arg}\n\n${USO}`)
    }
  }
  return { pgliteDir, dataDir }
}

/**
 * Mapa `nombreEnBase -> tipo` a partir del snapshot de drizzle-kit: es la
 * fuente de verdad de qué columnas son jsonb y boolean.
 */
function tipoDeColumnaSnapshot(snapshotTable, nombreColumna) {
  return snapshotTable.columns[nombreColumna]?.type
}

function quoteIdentifier(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`
}

/**
 * Lee todas las PK de una tabla de origen (SQLite vía @libsql/client).
 * Devuelve un array de arrays (una entrada por fila) en el orden de
 * `columnasPk`.
 */
export async function leerPksOrigen(cliente, tabla, columnasPk) {
  const columnas = columnasPk.map(quoteIdentifier).join(', ')
  const res = await cliente.execute(`SELECT ${columnas} FROM ${quoteIdentifier(tabla)}`)
  return res.rows.map((row) => columnasPk.map((c) => row[c]))
}

/**
 * Orquesta la migración completa. Recibe las dependencias ya construidas para
 * poder testearla sin CLI:
 *
 * - `db`: base destino (drizzle PgDatabase/PgliteDatabase/NodePgDatabase).
 * - `clienteDestino`: EjecutorSql (crearEjecutorSql) sobre esa misma base, para
 *   el DDL de `ge`, la lectura de PKs de destino y el setval.
 * - `schemaPg`: el módulo lib/db/schema.ts.
 * - `snapshot`: el JSON drizzle/meta/0000_snapshot.json (tables public.*).
 * - `abrirOrigen`: (nombre) => cliente @libsql/client abierto en modo RO.
 * - `asegurarDestino`: () => Promise<void> que corre migrarDb() + ensureGeSchema().
 * - `log`: (mensaje) => void (default console.log).
 *
 * Devuelve { resultados } con un resultado por tabla (conteo origen/destino,
 * diferencia y checksums).
 */
export async function migrar({
  db,
  clienteDestino,
  schemaPg,
  snapshot,
  abrirOrigen,
  asegurarDestino,
  log = console.log,
}) {
  await asegurarDestino()

  const tablasPublic = Object.values(snapshot.tables)
  const ordenPublic = ordenTopologico(
    Object.fromEntries(tablasPublic.map((t) => [`public.${t.name}`, t])),
  )

  const resultados = []

  for (const nombre of ordenPublic) {
    const tablaSnapshot = snapshot.tables[`public.${nombre}`]
    const tablaDrizzle = tablaPorNombre(schemaPg, nombre)
    const columnasDrizzle = Object.entries(getTableColumns(tablaDrizzle)).map(([clave, col]) => ({
      clave,
      nombre: col.name,
      tipo: tipoDeColumnaSnapshot(tablaSnapshot, col.name),
    }))
    const resultado = await migrarTabla({
      db,
      clienteDestino,
      tablaDrizzle,
      nombreEnBase: nombre,
      etiqueta: nombre,
      columnasPk: pkDeSnapshot(tablaSnapshot),
      columnas: columnasDrizzle,
      columnasDestino: columnasDrizzle.map((c) => c.nombre),
      abrirOrigen,
      log,
    })
    resultados.push(resultado)
  }

  // Las 5 tablas de ge.* no están en schemaPg (viven en GE_DDL), así que se
  // insertan con SQL armado a mano. El orden lo fija ORDEN_GE. Acá la clave de
  // salida coincide con el nombre de columna.
  for (const nombreGe of ORDEN_GE) {
    const tipos = TIPOS_GE[nombreGe]
    const columnas = COLUMNAS_GE[nombreGe].map((nombre) => ({
      clave: nombre,
      nombre,
      tipo: tipos[nombre],
    }))
    const resultado = await migrarTabla({
      db,
      clienteDestino,
      tablaDrizzle: null,
      nombreEnBase: nombreGe.split('.')[1],
      etiqueta: nombreGe,
      columnasPk: PK_GE[nombreGe],
      columnas,
      columnasDestino: COLUMNAS_GE[nombreGe],
      abrirOrigen,
      log,
    })
    resultados.push(resultado)
  }

  await ajustarSecuenciaGeCorte(clienteDestino)

  return { resultados }
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

async function migrarTabla({
  db,
  clienteDestino,
  tablaDrizzle,
  nombreEnBase,
  etiqueta,
  columnasPk,
  columnas,
  columnasDestino,
  abrirOrigen,
  log,
}) {
  const clienteOrigen = await abrirOrigen(nombreEnBase)

  // Si la tabla no existe en el origen (p. ej. un fixture chico de test, o una
  // base que aún no aplicó el batch que la creó), se salta sin error: no hay
  // filas que migrar. El destino queda con la tabla creada y vacía.
  if (!(await tablaExisteEnOrigen(clienteOrigen, nombreEnBase))) {
    log(`  ${etiqueta}: tabla ausente en origen, se salta`)
    const pksDestinoAusente = await leerPksDestino(clienteDestino, etiqueta, columnasPk)
    return compararTabla({ tabla: etiqueta, pksOrigen: [], pksDestino: pksDestinoAusente })
  }

  const pksOrigen = await leerPksOrigen(clienteOrigen, nombreEnBase, columnasPk)

  if (pksOrigen.length > 0) {
    // La migración corre offline, con el SQLite en sólo-lectura, y las tablas
    // del hub son chicas (a diferencia del padrón nominal, que tiene su propio
    // importador). Si alguna tabla creciera al punto de no caber en memoria,
    // este es el único punto a cambiar por un cursor por lotes.
    const res = await clienteOrigen.execute(`SELECT * FROM ${quoteIdentifier(nombreEnBase)}`)
    const filas = res.rows.map((f) => convertirFila(f, columnas))

    await db.transaction(async (tx) => {
      for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
        const lote = filas.slice(i, i + TAMANO_LOTE)
        if (tablaDrizzle) {
          await insertarConDrizzle(tx, tablaDrizzle, columnasPk, lote)
        } else {
          await insertarConSqlDirecto(tx, {
            tabla: etiqueta,
            columnas: columnasDestino,
            columnasPk,
            lote,
          })
        }
      }
    })
  }

  log(`  ${etiqueta}: ${pksOrigen.length} filas en origen`)

  const pksDestino = await leerPksDestino(clienteDestino, etiqueta, columnasPk)
  return compararTabla({ tabla: etiqueta, pksOrigen, pksDestino })
}

function insertarConDrizzle(tx, tablaDrizzle, columnasPk, lote) {
  const columnasTabla = getTableColumns(tablaDrizzle)
  // Drizzle indexa `target` y `set` por NOMBRE DE COLUMNA (la referencia al
  // objeto columna), pero el `target` acepta el objeto columna directamente.
  // Se arma un mapa nombreEnBase -> objeto columna para no depender de que la
  // clave JS coincida con el nombre de columna (p. ej. `user_id` vs `userId`).
  const porNombre = new Map()
  for (const col of Object.values(columnasTabla)) porNombre.set(col.name, col)

  const set = {}
  for (const [key, col] of Object.entries(columnasTabla)) {
    if (columnasPk.includes(col.name)) continue
    set[key] = sql.raw(`excluded.${quoteIdentifier(col.name)}`)
  }
  const target = columnasPk.map((nombre) => porNombre.get(nombre))
  const insert = tx.insert(tablaDrizzle).values(lote)
  // Tablas cuya PK abarca TODAS las columnas (p. ej. recurso_tags): no hay
  // columnas "resto" que actualizar, así que un DO UPDATE SET vacío sería SQL
  // inválido. El upsert correcto ahí es DO NOTHING.
  if (Object.keys(set).length === 0) {
    return insert.onConflictDoNothing({ target })
  }
  return insert.onConflictDoUpdate({ target, set })
}

/**
 * Inserta un lote de una tabla ge.* (que no tiene objeto drizzle en schemaPg)
 * con SQL armado a mano. Se usa el template `sql` de drizzle para que los
 * valores viajen parametrizados en ambos motores: funciona tanto en
 * node-postgres como en PGlite, y evita inyección. `OVERRIDING SYSTEM VALUE`
 * es obligatorio para ge.ge_corte porque `id` es GENERATED ALWAYS AS IDENTITY.
 */
function insertarConSqlDirecto(tx, { tabla, columnas, columnasPk, lote }) {
  const esIdentity = columnas.some((c) => tieneIdentidad(tabla, c))
  const override = esIdentity ? sql.raw(' OVERRIDING SYSTEM VALUE') : sql``
  const listaColumnas = sql.join(
    columnas.map((c) => sql.identifier(c)),
    sql`, `,
  )
  const filas = lote.map(
    (fila) => sql`(${sql.join(columnas.map((c) => sql`${fila[c] ?? null}`), sql`, `)})`,
  )
  const set = sql.join(
    columnas
      .filter((c) => !columnasPk.includes(c))
      .map((c) => sql`${sql.identifier(c)} = EXCLUDED.${sql.identifier(c)}`),
    sql`, `,
  )
  const conflicto = sql.join(
    columnasPk.map((c) => sql.identifier(c)),
    sql`, `,
  )
  // Si la PK abarca todas las columnas (p. ej. ge_alumno_seccion), no queda
  // ninguna para SET: el upsert correcto es DO NOTHING.
  const accion =
    columnas.filter((c) => !columnasPk.includes(c)).length === 0
      ? sql`DO NOTHING`
      : sql`DO UPDATE SET ${set}`

  return tx.execute(
    sql`INSERT INTO ${sql.identifier('ge')}.${sql.identifier(tabla.split('.')[1])} (${listaColumnas})${override} VALUES ${sql.join(filas, sql`, `)} ON CONFLICT (${conflicto}) ${accion}`,
  )
}

async function leerPksDestino(cliente, tablaCompleta, columnasPk) {
  const partes = tablaCompleta.split('.')
  const tablaSql =
    partes.length === 2
      ? `${quoteIdentifier(partes[0])}.${quoteIdentifier(partes[1])}`
      : quoteIdentifier(tablaCompleta)
  const columnas = columnasPk.map(quoteIdentifier).join(', ')
  const res = await cliente.execute(`SELECT ${columnas} FROM ${tablaSql}`)
  return res.rows.map((row) => columnasPk.map((c) => row[c]))
}

async function tablaExisteEnOrigen(cliente, tabla) {
  const res = await cliente.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [tabla],
  })
  return res.rows.length > 0
}

/**
 * Único setval real del sistema: ge.ge_corte.id es la única columna identity.
 * Si la tabla quedó vacía, `is_called = false` para que el próximo insert
 * arranque en 1 sin consumir ese id.
 */
export async function ajustarSecuenciaGeCorte(cliente) {
  const res = await cliente.execute('SELECT MAX(id) AS max_id FROM ge.ge_corte')
  const maxId = res.rows[0]?.max_id
  if (maxId === null || maxId === undefined) {
    await cliente.execute(`SELECT setval(pg_get_serial_sequence('ge.ge_corte', 'id'), 1, false)`)
    return
  }
  // Placeholder `?` + args (no `$1` embebido): es el contrato de EjecutorSql
  // (crearEjecutorSql traduce `?` a `$n` y pasa los args al driver).
  await cliente.execute({
    sql: `SELECT setval(pg_get_serial_sequence('ge.ge_corte', 'id'), ?, true)`,
    args: [Number(maxId)],
  })
}

function tablaPorNombre(schemaPg, nombre) {
  for (const valor of Object.values(schemaPg)) {
    if (valor && typeof valor === 'object') {
      let nombreTabla = null
      try {
        nombreTabla = getTableName(valor)
      } catch {
        nombreTabla = null
      }
      if (nombreTabla === nombre) return valor
    }
  }
  throw new Error(`No se encontró la tabla "${nombre}" en lib/db/schema.ts`)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const { pgliteDir, dataDir } = parsearArgs(process.argv.slice(2))

  const dataDirOrigen = dataDir ?? process.env.DATA_DIR ?? join(process.cwd(), '.data')

  // El origen siempre sale del DATA_DIR elegido para el CLI. Se setea el env
  // ANTES de importar @/lib/db porque getSqlitePath()/getGeSqlitePath() leen
  // DATA_DIR en tiempo de importación en algunos módulos.
  process.env.DATA_DIR = dataDirOrigen

  if (pgliteDir) {
    // La PGlite destino se persiste en su propio directorio y no debe mezclarse
    // con el DATA_DIR de origen.
    process.env.DATABASE_URL = ''
    process.env.PGLITE_DATA_DIR = pgliteDir
  }

  if (!pgliteDir && !process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL o --pglite <dir>.')
    console.error(USO)
    process.exit(2)
  }

  const hubPath = join(dataDirOrigen, 'hub.sqlite')
  const gePath = join(dataDirOrigen, 'ge.sqlite')
  for (const ruta of [hubPath, gePath]) {
    if (!existsSync(ruta)) {
      console.error(`No existe el origen ${ruta}`)
      process.exit(2)
    }
  }

  const { getDb, migrarDb, getRawClient } = await import('@/lib/db/index.ts')
  const { ensureGeSchema, crearEjecutorSql } = await import('@/lib/infraestructura/ge-db.ts')
  const schemaPg = await import('@/lib/db/schema.ts')
  const snapshot = (await import('../drizzle/meta/0000_snapshot.json', { with: { type: 'json' } }))
    .default

  // Sólo-lectura efectivo: @libsql/client no expone el flag SQLITE_OPEN_READONLY
  // ni acepta `?mode=ro` en la URL (sólo tls/authToken/cache). Para garantizar
  // que un bug del script jamás pueda mutar el archivo operativo, se trabaja
  // sobre COPIAS temporales del origen (fuera del repo, en os.tmpdir()) y se
  // borran al terminar. El original sólo se toca con copyFileSync (lectura).
  const dirCopias = mkdtempSync(join(tmpdir(), 'migrar-sqlite-'))
  const hubCopia = join(dirCopias, 'hub.sqlite')
  const geCopia = join(dirCopias, 'ge.sqlite')
  copyFileSync(hubPath, hubCopia)
  copyFileSync(gePath, geCopia)
  process.on('exit', () => rmSync(dirCopias, { recursive: true, force: true }))

  const abrirOrigen = (nombre) => {
    const ruta = nombre.startsWith('ge_') ? geCopia : hubCopia
    return createClient({ url: `file:${ruta}` })
  }

  const db = getDb()
  const clienteDestino = crearEjecutorSql(getRawClient())

  const asegurarDestino = async () => {
    await migrarDb()
    await ensureGeSchema(clienteDestino)
  }

  console.log(`Origen: ${dataDirOrigen}`)
  console.log(pgliteDir ? `Destino: PGlite ${pgliteDir}` : 'Destino: Postgres (DATABASE_URL)')
  console.log('')

  const { resultados } = await migrar({
    db,
    clienteDestino,
    schemaPg,
    snapshot,
    abrirOrigen,
    asegurarDestino,
    log: (m) => console.log(m),
  })

  console.log('')
  console.log('Reporte de verificación:')
  const fallas = []
  for (const r of resultados) {
    console.log(formatearLineaReporte(r))
    if (r.conteoOrigen !== r.conteoDestino || !r.checksumOk) fallas.push(r)
  }

  if (fallas.length > 0) {
    console.error('')
    console.error(`MIGRACIÓN CON FALLAS: ${fallas.length} tabla(s) no coinciden.`)
    for (const r of fallas) {
      if (!r.checksumOk) {
        console.error(
          `  ${r.tabla}: checksum ${r.checksumOrigen} != ${r.checksumDestino}` +
            (r.filasFaltantes.length > 0 ? `; faltantes (muestra) ${JSON.stringify(r.filasFaltantes)}` : '') +
            (r.filasExtra.length > 0 ? `; extra (muestra) ${JSON.stringify(r.filasExtra)}` : ''),
        )
      }
    }
    // El cliente de la base es compartido y no cierra por invocación de script;
    // se corta explícito para que el exit code sea el que dice ser.
    process.exit(1)
  }

  console.log('')
  console.log(`OK: ${resultados.length} tablas migradas y verificadas.`)
  process.exit(0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
