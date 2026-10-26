#!/usr/bin/env node
/**
 * Imports the higher-education enrollment workbook (matrícula nominal) as a new
 * cut and activates it only when every row has been written.
 *
 * Usage:
 *   MATRICULA_DNI_SECRET=... node scripts/import-matricula.mjs --file <xlsx> --ciclo 2026 [--dry-run] [--excluded <csv>]
 *
 * Design:
 * - Streaming read of the workbook (exceljs WorkbookReader); rows are validated
 *   and written in batches, the whole file is never held in memory.
 * - A cut is 'cargando' while it loads. On success it becomes 'vigente' in the
 *   same transaction that marks the previous vigente as 'reemplazado'. On any
 *   failure the cut is deleted; its rows go with it (ON DELETE CASCADE).
 * - Excluded rows are written to a CSV with the raw cells; the DNI cell is
 *   masked to its last 3 digits.
 * - Plain DNIs never reach the database or the logs: only dni_hash is stored.
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, eq, lt, ne } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'
import { hashDni, requireDniSecret } from '../lib/infraestructura/matricula/dni.ts'
import {
  COLUMN_INDEX,
  EXCLUSION_REASONS,
  MATRICULA_COLUMNS,
  cellText,
  normalizeDni,
  sectorFromSheetName,
  validateRow,
} from '../lib/infraestructura/matricula/filas.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
registerTsResolver(root)

const { matriculaCorte, matriculaCarrera, matriculaAlumno } = await import('../lib/db/schema.ts')

export const BATCH_SIZE = 1000
// Only with the import lock held: a 'cargando' cut older than this can only be
// left by a killed run and is removed before a new import starts.
export const STALE_LOADING_MS = 2 * 60 * 60 * 1000
export const IMPORT_LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('matricula_import')) AS ok"
const IMPORT_UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('matricula_import'))"
const COLUMN_COUNT = MATRICULA_COLUMNS.length

export function parseArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return undefined
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    return v
  }
  return {
    file: value('--file'),
    ciclo: value('--ciclo'),
    excluded: value('--excluded'),
    dryRun: argv.includes('--dry-run'),
  }
}

// Masks a DNI cell: keeps the last 3 digits, hides the rest. Non-digit content
// is reduced to digits first so no letters from a shifted row leak through.
export function maskDniCell(value) {
  const digits = cellText(value).replace(/\D/g, '')
  if (digits.length <= 3) return '*'.repeat(3)
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`
}

// The DNI column is always masked. A shifted row can put a DNI in another
// column, so any 6 to 9 digit cell outside the CUE column is masked too.
function shouldMaskCell(index, value) {
  if (index === COLUMN_INDEX.dni) return true
  if (index === COLUMN_INDEX.cue) return false
  return normalizeDni(value) !== null
}

function csvField(value) {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvLine(fields) {
  return `${fields.map(csvField).join(',')}\n`
}

// Yields every non-empty data row of the two sheets. Headers are checked once
// per sheet so a changed export fails loudly instead of excluding every row.
export async function* readWorkbookRows(file) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    entries: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  })
  for await (const sheet of reader) {
    const sector = sectorFromSheetName(sheet.name ?? '')
    if (!sector) {
      yield { skippedSheet: sheet.name }
      continue
    }
    for await (const row of sheet) {
      const cells = Array.from({ length: COLUMN_COUNT }, (_, i) => row.values[i + 1])
      if (row.number === 1) {
        if (cellText(cells[COLUMN_INDEX.cue]) !== 'CUE' || cellText(cells[COLUMN_INDEX.dni]) !== 'DNI') {
          throw new Error(`Unexpected header in sheet "${sheet.name}": expected CUE and DNI columns`)
        }
        continue
      }
      if (cells.every((c) => cellText(c) === '')) {
        yield { empty: true }
        continue
      }
      yield { sheet: sheet.name, sector, number: row.number, cells }
    }
  }
}

export function createExcludedWriter(path) {
  mkdirSync(dirname(path), { recursive: true })
  const stream = createWriteStream(path, { encoding: 'utf8' })
  stream.write(
    `﻿${csvLine(['hoja', 'fila', 'motivo', ...MATRICULA_COLUMNS.map((c) => (c === 'DNI' ? 'DNI (enmascarado)' : c))])}`,
  )
  return {
    write({ sheet, number, reason, cells }) {
      const raw = cells.map((c, i) => (shouldMaskCell(i, c) ? maskDniCell(c) : cellText(c)))
      stream.write(csvLine([sheet, number, reason, ...raw]))
    },
    close() {
      return new Promise((resolveClose, rejectClose) => {
        stream.end((err) => (err ? rejectClose(err) : resolveClose()))
      })
    },
  }
}

function emptySummary() {
  return {
    leidas: 0,
    vacias: 0,
    importadas: 0,
    excluidas: 0,
    excluidasPorMotivo: {},
    hojasIgnoradas: [],
    carreras: new Set(),
    cues: new Set(),
    alumnosInsertados: 0,
  }
}

function countExclusion(summary, reason) {
  summary.excluidas++
  summary.excluidasPorMotivo[reason] = (summary.excluidasPorMotivo[reason] ?? 0) + 1
}

/**
 * Reads the workbook and produces the summary. With `persist` (receives each
 * accepted batch and returns the number of inserted students) rows are written
 * as they are accepted; without it the run is a pure dry run.
 */
async function processWorkbook(file, { excludedWriter, persist }) {
  const summary = emptySummary()
  const seenStudents = new Set()
  let batch = []

  const flush = async () => {
    if (batch.length === 0) return
    if (persist) summary.alumnosInsertados += await persist(batch)
    batch = []
  }

  for await (const item of readWorkbookRows(file)) {
    if (item.skippedSheet !== undefined) {
      summary.hojasIgnoradas.push(item.skippedSheet)
      continue
    }
    if (item.empty) {
      summary.vacias++
      continue
    }
    summary.leidas++
    const result = validateRow(item.cells, item.sector)
    if (!result.ok) {
      countExclusion(summary, result.reason)
      excludedWriter?.write({ sheet: item.sheet, number: item.number, reason: result.reason, cells: item.cells })
      continue
    }

    const row = result.row
    const careerKey = `${row.cueAnexo}|${row.career}|${row.rm}`
    const dniHash = hashDni(row.dni)
    const studentKey = `${careerKey}|${dniHash}`
    if (seenStudents.has(studentKey)) {
      countExclusion(summary, EXCLUSION_REASONS.duplicateStudent)
      excludedWriter?.write({
        sheet: item.sheet,
        number: item.number,
        reason: EXCLUSION_REASONS.duplicateStudent,
        cells: item.cells,
      })
      continue
    }
    seenStudents.add(studentKey)

    summary.importadas++
    summary.carreras.add(careerKey)
    summary.cues.add(row.cueAnexo)
    batch.push({ careerKey, row, dniHash })
    if (batch.length >= BATCH_SIZE) await flush()
  }
  await flush()
  return summary
}

// Session-level advisory lock held for the whole run. A pool gives this run its
// own connection (released at the end); PGlite has a single connection.
export async function acquireImportLock(raw) {
  const dedicated = typeof raw.connect === 'function'
  const client = dedicated ? await raw.connect() : raw
  const { rows } = await client.query(IMPORT_LOCK_SQL)
  if (!rows[0]?.ok) {
    if (dedicated) client.release()
    return null
  }
  return {
    async release() {
      try {
        await client.query(IMPORT_UNLOCK_SQL)
      } finally {
        if (dedicated) client.release()
      }
    },
  }
}

// DrizzleQueryError messages embed the bound parameters (names, dni_hash), so
// query failures are described by class name and driver code only.
export function describeError(err) {
  if (err && typeof err === 'object' && 'params' in err) {
    const code = err.cause?.code
    return `${err.name}${code ? ` (code ${code})` : ''}`
  }
  return err instanceof Error ? err.message : String(err)
}

export function reportFailure(err) {
  console.error(`[import-matricula] failed: ${describeError(err)}`)
}

async function openCut(db, { file, ciclo }) {
  const threshold = new Date(Date.now() - STALE_LOADING_MS).toISOString()
  await db
    .delete(matriculaCorte)
    .where(and(eq(matriculaCorte.estado, 'cargando'), lt(matriculaCorte.creadoEn, threshold)))

  const [cut] = await db
    .insert(matriculaCorte)
    .values({
      fuente: basename(file),
      cicloLectivo: ciclo,
      estado: 'cargando',
      creadoEn: new Date().toISOString(),
    })
    .returning({ id: matriculaCorte.id })
  return cut.id
}

/**
 * Imports the workbook. A dry run validates and reports without touching the
 * database. A real run takes the import lock, writes the cut and activates it
 * only when every accepted row was inserted; any failure deletes the cut and
 * its rows.
 */
export async function importMatricula({ file, ciclo, dryRun = false, excludedPath, db, raw, deps = {} }) {
  const cicloNumber = Number(ciclo)
  if (!Number.isInteger(cicloNumber) || cicloNumber < 2000) throw new Error('--ciclo must be a year, e.g. 2026')
  requireDniSecret()

  const excludedWriter = createExcludedWriter(excludedPath)
  let lock = null
  let corteId = null
  try {
    if (dryRun) {
      const summary = await processWorkbook(file, { excludedWriter })
      return formatResult({ summary, corteId, dryRun, excludedPath })
    }

    if (!raw) throw new Error('importMatricula needs the raw client to take the import lock')
    lock = await acquireImportLock(raw)
    if (!lock) throw new Error('Another matricula import holds the lock: exiting without changes')

    corteId = await openCut(db, { file, ciclo: cicloNumber })
    const idByCareerKey = new Map()
    const summary = await processWorkbook(file, {
      excludedWriter,
      persist: async (batch) => {
        await ensureCareers(db, corteId, batch, idByCareerKey)
        return persistStudents(db, corteId, batch, idByCareerKey)
      },
    })
    if (summary.importadas === 0) throw new Error('No valid rows: the cut was not activated')
    if (summary.alumnosInsertados !== summary.importadas) {
      throw new Error(
        `Inserted ${summary.alumnosInsertados} students for ${summary.importadas} accepted rows: the cut was not activated`,
      )
    }
    await deps.beforeActivate?.()
    await activateCut(db, corteId, summary)
    return formatResult({ summary, corteId, dryRun, excludedPath })
  } catch (error) {
    if (corteId !== null) {
      await db
        .delete(matriculaCorte)
        .where(eq(matriculaCorte.id, corteId))
        .catch((cleanupError) => console.error(`[import-matricula] could not delete cut ${corteId}: ${describeError(cleanupError)}`))
    }
    throw error
  } finally {
    await lock?.release()
    await excludedWriter.close()
  }
}

// Inserts the careers of a batch that are not yet known for this cut and
// records their ids. A career is keyed by CUE, name and RM, the unique key.
async function ensureCareers(db, corteId, batch, idByCareerKey) {
  for (const { careerKey, row } of batch) {
    if (idByCareerKey.has(careerKey)) continue
    const [inserted] = await db
      .insert(matriculaCarrera)
      .values({
        corteId,
        cueAnexo: row.cueAnexo,
        instituto: row.institute,
        nombre: row.career,
        rm: row.rm,
        tipo: row.type,
        estado: row.status,
        sector: row.sector,
      })
      .returning({ id: matriculaCarrera.id })
    idByCareerKey.set(careerKey, inserted.id)
  }
}

async function persistStudents(db, corteId, batch, idByCareerKey) {
  const values = batch.map(({ careerKey, row, dniHash }) => ({
    corteId,
    carreraId: idByCareerKey.get(careerKey),
    apellidos: row.surnames,
    nombres: row.names,
    nombreBusqueda: row.searchName,
    dniHash,
  }))
  const inserted = await db
    .insert(matriculaAlumno)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: matriculaAlumno.id })
  return inserted.length
}

async function activateCut(db, corteId, summary) {
  await db.transaction(async (tx) => {
    await tx
      .update(matriculaCorte)
      .set({ estado: 'reemplazado' })
      .where(and(eq(matriculaCorte.estado, 'vigente'), ne(matriculaCorte.id, corteId)))
    await tx
      .update(matriculaCorte)
      .set({ estado: 'vigente', filasImportadas: summary.importadas, filasExcluidas: summary.excluidas })
      .where(eq(matriculaCorte.id, corteId))
  })
}

function formatResult({ summary, corteId, dryRun, excludedPath }) {
  return {
    corteId,
    dryRun,
    excludedPath,
    leidas: summary.leidas,
    vacias: summary.vacias,
    importadas: summary.importadas,
    excluidas: summary.excluidas,
    excluidasPorMotivo: summary.excluidasPorMotivo,
    hojasIgnoradas: summary.hojasIgnoradas,
    carreras: summary.carreras.size,
    cues: summary.cues.size,
    alumnosInsertados: summary.alumnosInsertados,
  }
}

function defaultExcludedPath(file, ciclo) {
  const base = basename(file, extname(file))
  return join(dirname(resolve(file)), `${base}.excluidas-${ciclo}.csv`)
}

function printSummary(r) {
  console.log(`${r.dryRun ? 'Dry run (no database writes)' : `Cut ${r.corteId} activated`}`)
  console.log(`  rows read: ${r.leidas} (empty skipped: ${r.vacias})`)
  if (r.hojasIgnoradas.length) console.log(`  sheets ignored: ${r.hojasIgnoradas.join(', ')}`)
  console.log(`  imported: ${r.importadas}`)
  console.log(`  excluded: ${r.excluidas}`)
  for (const [motivo, n] of Object.entries(r.excluidasPorMotivo).sort()) console.log(`    ${motivo}: ${n}`)
  console.log(`  careers: ${r.carreras}`)
  console.log(`  CUEs: ${r.cues}`)
  if (!r.dryRun) console.log(`  students inserted: ${r.alumnosInsertados}`)
  console.log(`  excluded CSV: ${r.excludedPath}`)
  console.warn(
    '[import-matricula] AVISO: el CSV de excluidas contiene nombres en texto plano. Revisarlo para corregir el origen y luego borrarlo.',
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file || !args.ciclo) {
    console.error('Usage: node scripts/import-matricula.mjs --file <xlsx> --ciclo <año> [--dry-run] [--excluded <csv>]')
    process.exitCode = 1
    return
  }
  const file = resolve(args.file)
  const excludedPath = args.excluded ? resolve(args.excluded) : defaultExcludedPath(file, args.ciclo)
  let db = null
  let raw = null
  if (!args.dryRun) {
    const { getDb, getRawClient, migrarDb } = await import('../lib/db/index.ts')
    await migrarDb()
    db = getDb()
    raw = getRawClient()
  }
  const result = await importMatricula({ file, ciclo: args.ciclo, dryRun: args.dryRun, excludedPath, db, raw })
  printSummary(result)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    reportFailure(err)
    process.exitCode = 1
  })
}
