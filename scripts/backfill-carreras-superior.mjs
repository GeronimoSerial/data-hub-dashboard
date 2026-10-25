#!/usr/bin/env node
/**
 * Backfill de la columna legacy `infra_afectacion.carreras` (nombres de carrera,
 * modelo del catálogo estático) hacia `infra_afectacion_carrera` (modelo de
 * matrícula: id de carrera del corte vigente).
 *
 * Usage:
 *   node scripts/backfill-carreras-superior.mjs [--report <csv>]            # dry-run (default)
 *   node scripts/backfill-carreras-superior.mjs --apply [--report <csv>]    # escribe en una transacción
 *
 * Reglas:
 * - Cada nombre se empareja por CUE sólo con las carreras del único corte de
 *   matrícula vigente, comparando con normalizeSearchName (sin acentos, minúsculas).
 * - Sólo se revisan afectaciones con `carreras` no nulo y sin filas en
 *   infra_afectacion_carrera.
 * - Sin coincidencia o con homónimos (más de una carrera con el mismo nombre)
 *   no se escribe: la fila va al CSV de reporte para corregir en origen.
 * - Dry-run es el modo por defecto: no migra ni escribe en la base. Si faltan
 *   tablas, sale con código distinto de cero y pide ejecutar la app o --apply.
 * - `--apply` migra, escribe todo dentro de una única transacción y es
 *   idempotente: una segunda corrida no agrega filas.
 * - El CSV de reporte contiene sólo nombres de carreras, nunca alumnos: el
 *   script no lee personas.
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, isNotNull, sql } from 'drizzle-orm'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
import { normalizeSearchName } from '../lib/infraestructura/matricula/filas.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
registerTsResolver(root)

const schema = await import('../lib/db/schema.ts')
const { infraAfectacion, infraAfectacionCarrera, infraParte, matriculaCarrera, matriculaCorte } = schema

export const RAZON = {
  SIN_COINCIDENCIA: 'sin-coincidencia',
  AMBIGUO: 'ambiguo',
  SIN_MATRICULA_VIGENTE: 'sin-matricula-vigente',
  FORMATO_INVALIDO: 'formato-invalido',
}
export const CSV_CABECERA = ['afectacion_id', 'cue', 'carrera', 'razon']
export const TABLAS_REQUERIDAS = ['matricula_corte', 'matricula_carrera', 'infra_afectacion_carrera']
export const MENSAJE_FALTAN_MIGRACIONES = 'Faltan migraciones: ejecute la app o --apply'
const TAMANIO_LOTE = 500

export function parseArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return undefined
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    return v
  }
  return {
    apply: argv.includes('--apply'),
    report: value('--report') ?? join(process.cwd(), 'backfill-carreras-superior-report.csv'),
  }
}

function csvCelda(valor) {
  const texto = String(valor ?? '')
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function csvLinea(campos) {
  return campos.map(csvCelda).join(',')
}

/**
 * Planifica el backfill sin escribir nada. Pura: recibe las lecturas ya hechas.
 * - afectaciones: [{ id, cue, carreras }] con `carreras` tal como está en la columna legacy
 * - yaMigradas: Set de ids de afectación que ya tienen filas en infra_afectacion_carrera
 * - vigente: { id } del corte de matrícula vigente, o null
 * - carrerasVigentes: [{ id, cueAnexo, nombre }] del corte vigente
 */
export function planificarBackfill({ afectaciones, yaMigradas, vigente, carrerasVigentes }) {
  const resumen = {
    afectacionesLeidas: afectaciones.length,
    yaMigradas: 0,
    sinNombres: 0,
    formatoInvalido: 0,
    sinMatriculaVigente: 0,
    nombresRevisados: 0,
    nombresVinculados: 0,
    nombresSinCoincidencia: 0,
    nombresAmbiguos: 0,
    filasAInsertar: 0,
    afectacionesConFilas: 0,
  }
  const filas = []
  const reporte = []
  const vistas = new Set()

  const porCueYNombre = new Map()
  for (const carrera of carrerasVigentes) {
    const porNombre = porCueYNombre.get(carrera.cueAnexo) ?? new Map()
    const clave = normalizeSearchName(carrera.nombre)
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), carrera.id])
    porCueYNombre.set(carrera.cueAnexo, porNombre)
  }

  for (const afectacion of afectaciones) {
    if (yaMigradas.has(afectacion.id)) {
      resumen.yaMigradas++
      continue
    }
    const nombres = afectacion.carreras
    if (!Array.isArray(nombres) || nombres.some((nombre) => typeof nombre !== 'string')) {
      resumen.formatoInvalido++
      reporte.push({ afectacion_id: afectacion.id, cue: afectacion.cue, carrera: '', razon: RAZON.FORMATO_INVALIDO })
      continue
    }
    if (nombres.length === 0) {
      resumen.sinNombres++
      continue
    }
    if (!vigente) {
      resumen.sinMatriculaVigente++
      for (const nombre of nombres) {
        reporte.push({ afectacion_id: afectacion.id, cue: afectacion.cue, carrera: nombre, razon: RAZON.SIN_MATRICULA_VIGENTE })
      }
      continue
    }

    const porNombre = porCueYNombre.get(afectacion.cue) ?? new Map()
    let vinculadasEnEstaAfectacion = 0
    for (const nombre of new Set(nombres)) {
      resumen.nombresRevisados++
      const candidatas = porNombre.get(normalizeSearchName(nombre)) ?? []
      if (candidatas.length === 0) {
        resumen.nombresSinCoincidencia++
        reporte.push({ afectacion_id: afectacion.id, cue: afectacion.cue, carrera: nombre, razon: RAZON.SIN_COINCIDENCIA })
        continue
      }
      if (candidatas.length > 1) {
        resumen.nombresAmbiguos++
        reporte.push({ afectacion_id: afectacion.id, cue: afectacion.cue, carrera: nombre, razon: RAZON.AMBIGUO })
        continue
      }
      const carreraId = candidatas[0]
      const clave = `${afectacion.id}|${carreraId}`
      if (vistas.has(clave)) continue
      vistas.add(clave)
      resumen.nombresVinculados++
      vinculadasEnEstaAfectacion++
      filas.push({ afectacionId: afectacion.id, matriculaCorteId: vigente.id, carreraId })
    }
    if (vinculadasEnEstaAfectacion > 0) resumen.afectacionesConFilas++
  }

  resumen.filasAInsertar = filas.length
  return { filas, reporte, resumen }
}

export async function leerEntrada(db) {
  const afectaciones = await db
    .select({ id: infraAfectacion.id, cue: infraParte.cueAnexo, carreras: infraAfectacion.carreras })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
    .where(isNotNull(infraAfectacion.carreras))
  const yaMigradas = new Set(
    (await db.select({ id: infraAfectacionCarrera.afectacionId }).from(infraAfectacionCarrera)).map((fila) => fila.id),
  )
  const [vigente] = await db
    .select({ id: matriculaCorte.id })
    .from(matriculaCorte)
    .where(eq(matriculaCorte.estado, 'vigente'))
    .limit(1)
  const carrerasVigentes = vigente
    ? await db
      .select({ id: matriculaCarrera.id, cueAnexo: matriculaCarrera.cueAnexo, nombre: matriculaCarrera.nombre })
      .from(matriculaCarrera)
      .where(eq(matriculaCarrera.corteId, vigente.id))
    : []
  return { afectaciones, yaMigradas, vigente: vigente ?? null, carrerasVigentes }
}

export async function faltanTablas(db) {
  const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
  const presentes = new Set(res.rows.map((fila) => fila.table_name))
  return TABLAS_REQUERIDAS.filter((tabla) => !presentes.has(tabla))
}

/**
 * Devuelve la base lista para leer. `--apply` migra antes; dry-run no toca el
 * esquema y falla si faltan tablas.
 */
export async function prepararDb({ apply }, { getDb, migrarDb }) {
  if (apply) {
    await migrarDb()
    return getDb()
  }
  const db = getDb()
  if ((await faltanTablas(db)).length > 0) throw new Error(MENSAJE_FALTAN_MIGRACIONES)
  return db
}

export async function aplicarBackfill(db, { filas }) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < filas.length; i += TAMANIO_LOTE) {
      const lote = filas.slice(i, i + TAMANIO_LOTE).map((fila) => ({
        afectacionId: fila.afectacionId,
        matriculaCorteId: fila.matriculaCorteId,
        carreraId: fila.carreraId,
      }))
      await tx.insert(infraAfectacionCarrera).values(lote).onConflictDoNothing()
    }
  })
}

export function escribirReporte(path, reporte) {
  mkdirSync(dirname(resolve(path)), { recursive: true })
  const salida = createWriteStream(path, { encoding: 'utf8' })
  salida.write(`${csvLinea(CSV_CABECERA)}\n`)
  for (const fila of reporte) {
    salida.write(`${csvLinea([fila.afectacion_id, fila.cue, fila.carrera, fila.razon])}\n`)
  }
  return new Promise((resolver, rechazar) => {
    salida.on('error', rechazar)
    salida.end(() => resolver(path))
  })
}

export function formatearResumen(resumen, { apply, reportePath }) {
  const lineas = [
    `Modo: ${apply ? 'APLICAR (transacción única)' : 'dry-run (no escribe)'}`,
    `Afectaciones con carreras legacy: ${resumen.afectacionesLeidas}`,
    `  ya migradas (omitidas): ${resumen.yaMigradas}`,
    `  sin nombres: ${resumen.sinNombres}`,
    `  formato inválido: ${resumen.formatoInvalido}`,
    `  sin matrícula vigente para su CUE: ${resumen.sinMatriculaVigente}`,
    `Nombres revisados: ${resumen.nombresRevisados}`,
    `  vinculados: ${resumen.nombresVinculados}`,
    `  sin coincidencia: ${resumen.nombresSinCoincidencia}`,
    `  ambiguos (homónimos): ${resumen.nombresAmbiguos}`,
    `Filas a insertar en infra_afectacion_carrera: ${resumen.filasAInsertar} (afectaciones: ${resumen.afectacionesConFilas})`,
    `Reporte CSV: ${reportePath}`,
  ]
  return lineas.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { getDb, migrarDb } = await import('../lib/db/index.ts')
  const db = await prepararDb(args, { getDb, migrarDb })
  const entrada = await leerEntrada(db)
  const plan = planificarBackfill(entrada)
  await escribirReporte(args.report, plan.reporte)
  if (args.apply) await aplicarBackfill(db, plan)
  console.log(formatearResumen(plan.resumen, { apply: args.apply, reportePath: resolve(args.report) }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof Error && err.message === MENSAJE_FALTAN_MIGRACIONES) {
      console.error(MENSAJE_FALTAN_MIGRACIONES)
    } else {
      console.error(`[backfill-carreras-superior] fallo: ${err instanceof Error ? err.name : 'error'}`)
    }
    process.exitCode = 1
  })
}
