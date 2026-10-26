import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { usarDbTemporal } from '../lib/test-utils/db-temporal'
import {
  infraAfectacion,
  infraAfectacionCarrera,
  infraParte,
  infraPeriodo,
  matriculaCarrera,
  matriculaCorte,
} from '../lib/db/schema'
import {
  CSV_CABECERA,
  MENSAJE_FALTAN_MIGRACIONES,
  RAZON,
  aplicarBackfill,
  escribirReporte,
  leerEntrada,
  parseArgs,
  planificarBackfill,
  prepararDb,
} from './backfill-carreras-superior.mjs'

usarDbTemporal('backfill-carreras-superior')

const CUE = '180176400'
const CUE_SIN_MATRICULA = '180176999'
const FECHA = '2026-01-01T00:00:00.000Z'

let tmp = ''
const directorioScripts = path.dirname(fileURLToPath(import.meta.url))

async function sembrar() {
  const db = getDb()
  await db.insert(infraPeriodo).values({
    id: 'periodo-backfill', nombre: 'Período backfill', inicioEn: FECHA, finEn: null, estado: 'historico', creadaEn: FECHA,
  })
  await db.insert(infraParte).values([
    { id: 'parte-1', periodoId: 'periodo-backfill', cueAnexo: CUE, estadoEstablecimientoRigeDesde: FECHA, corteId: 0, creadaEn: FECHA, actualizadaEn: FECHA },
    { id: 'parte-2', periodoId: 'periodo-backfill', cueAnexo: CUE_SIN_MATRICULA, estadoEstablecimientoRigeDesde: FECHA, corteId: 0, creadaEn: FECHA, actualizadaEn: FECHA },
  ])
  const afectacion = (id: string, parteId: string, carreras: string[] | null) => ({
    id, parteId, motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: FECHA, creadaEn: FECHA, carreras,
  })
  await db.insert(infraAfectacion).values([
    afectacion('af-acento', 'parte-1', ['TÉCNICA EN ambiente']),
    afectacion('af-homonimo', 'parte-1', ['Enfermería']),
    afectacion('af-inexistente', 'parte-1', ['Carrera que no existe']),
    afectacion('af-sin-matricula', 'parte-2', ['Tecnicatura en Ambiente']),
    afectacion('af-sin-carreras', 'parte-1', null),
  ])
  const [corte] = await db.insert(matriculaCorte).values({
    fuente: 'test', cicloLectivo: 2026, estado: 'vigente', creadoEn: FECHA,
  }).returning({ id: matriculaCorte.id })
  const carrera = (nombre: string, rm: string) => ({
    corteId: corte!.id, cueAnexo: CUE, instituto: 'Instituto X', nombre, rm, tipo: 'Tecnicatura', estado: 'ABIERTA', sector: 'estatal',
  })
  await db.insert(matriculaCarrera).values([
    carrera('Tecnica en Ambiente', '1/20'),
    carrera('Enfermería', '2/20'),
    carrera('Enfermería', '3/20'),
  ])
  return corte!.id
}

beforeAll(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'backfill-carreras-'))
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('parseArgs', () => {
  it('dry-run por defecto y --apply explícito', () => {
    expect(parseArgs([]).apply).toBe(false)
    expect(parseArgs(['--apply', '--report', 'r.csv'])).toEqual({ apply: true, report: 'r.csv' })
  })

  it('exige valor para --report', () => {
    expect(() => parseArgs(['--report'])).toThrow('--report needs a value')
  })
})

describe('planificarBackfill', () => {
  const corte = { id: 7 }
  const carreras = [
    { id: 1, cueAnexo: CUE, nombre: 'Tecnica en Ambiente' },
    { id: 2, cueAnexo: CUE, nombre: 'Enfermería' },
    { id: 3, cueAnexo: CUE, nombre: 'Enfermeria' },
  ]

  it('empareja sin acentos, marca homónimos y sin coincidencia, y omite las ya migradas', () => {
    const plan = planificarBackfill({
      afectaciones: [
        { id: 'a1', cue: CUE, carreras: ['TÉCNICA en ambiente'] },
        { id: 'a2', cue: CUE, carreras: ['Enfermería', 'Inexistente'] },
        { id: 'a3', cue: CUE, carreras: ['Enfermería'] },
        { id: 'a4', cue: CUE, carreras: ['Enfermería'] },
      ],
      yaMigradas: new Set(['a4']),
      vigente: corte,
      carrerasVigentes: carreras,
    })

    expect(plan.filas).toEqual([
      { afectacionId: 'a1', matriculaCorteId: 7, carreraId: 1 },
    ])
    expect(plan.reporte).toEqual([
      { afectacion_id: 'a2', cue: CUE, carrera: 'Enfermería', razon: RAZON.AMBIGUO },
      { afectacion_id: 'a2', cue: CUE, carrera: 'Inexistente', razon: RAZON.SIN_COINCIDENCIA },
      { afectacion_id: 'a3', cue: CUE, carrera: 'Enfermería', razon: RAZON.AMBIGUO },
    ])
    expect(plan.resumen).toMatchObject({
      afectacionesLeidas: 4,
      yaMigradas: 1,
      nombresRevisados: 4,
      nombresVinculados: 1,
      nombresSinCoincidencia: 1,
      nombresAmbiguos: 2,
      filasAInsertar: 1,
      afectacionesConFilas: 1,
    })
  })

  it('sin corte vigente reporta cada nombre como sin matrícula, y valida el formato', () => {
    const plan = planificarBackfill({
      afectaciones: [
        { id: 'a1', cue: CUE, carreras: ['Enfermería'] },
        { id: 'a2', cue: CUE, carreras: 'no es lista' },
        { id: 'a3', cue: CUE, carreras: [] },
      ],
      yaMigradas: new Set(),
      vigente: null,
      carrerasVigentes: [],
    })

    expect(plan.filas).toEqual([])
    expect(plan.reporte).toEqual([
      { afectacion_id: 'a1', cue: CUE, carrera: 'Enfermería', razon: RAZON.SIN_MATRICULA_VIGENTE },
      { afectacion_id: 'a2', cue: CUE, carrera: '', razon: RAZON.FORMATO_INVALIDO },
    ])
    expect(plan.resumen).toMatchObject({ sinMatriculaVigente: 1, formatoInvalido: 1, sinNombres: 1 })
  })

  it('escribe el CSV con cabecera y escapa celdas con comas', async () => {
    const destino = path.join(tmp, 'reporte.csv')
    await escribirReporte(destino, [{ afectacion_id: 'a1', cue: CUE, carrera: 'Carrera, con coma', razon: RAZON.AMBIGUO }])
    expect(readFileSync(destino, 'utf8')).toBe(`${CSV_CABECERA.join(',')}\na1,${CUE},"Carrera, con coma",ambiguo\n`)
  })
})

describe('prepararDb', () => {
  it('dry-run no migra y devuelve la base cuando las tablas existen', async () => {
    const migrarDb = vi.fn()
    const db = await prepararDb({ apply: false }, { getDb, migrarDb })
    expect(db).toBe(getDb())
    expect(migrarDb).not.toHaveBeenCalled()
  })

  it('dry-run con tablas faltantes falla con el mensaje y no migra', async () => {
    const sinTablas = { execute: async () => ({ rows: [{ table_name: 'otra' }] }) }
    const migrarDb = vi.fn()
    await expect(prepararDb({ apply: false }, { getDb: () => sinTablas, migrarDb })).rejects.toThrow(
      MENSAJE_FALTAN_MIGRACIONES,
    )
    expect(migrarDb).not.toHaveBeenCalled()
  })

  it('--apply migra antes de leer la base', async () => {
    const migrarDb = vi.fn(async () => {})
    await prepararDb({ apply: true }, { getDb, migrarDb })
    expect(migrarDb).toHaveBeenCalledOnce()
  })
})

describe('CLI dry-run sin migraciones', () => {
  it('sale con código distinto de cero y muestra el mensaje', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: mkdtempSync(path.join(tmp, 'vacio-')) }
    delete env.DATABASE_URL
    delete env.PGLITE_DATA_DIR
    delete env.VITEST
    const script = path.join(directorioScripts, 'backfill-carreras-superior.mjs')
    const res = spawnSync(process.execPath, [script, '--report', path.join(tmp, 'vacio.csv')], {
      env,
      encoding: 'utf8',
      timeout: 120_000,
    })
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain(MENSAJE_FALTAN_MIGRACIONES)
  }, 150_000)
})

describe('backfill sobre la base', () => {
  it('dry-run no escribe; --apply escribe una vez y una segunda corrida no agrega filas', async () => {
    const corteId = await sembrar()
    const db = getDb()
    const contar = async () => (await db.select({ n: count() }).from(infraAfectacionCarrera))[0]!.n

    const entrada = await leerEntrada(db)
    const dryRun = planificarBackfill(entrada)
    expect(dryRun.filas).toEqual([{ afectacionId: 'af-acento', matriculaCorteId: corteId, carreraId: expect.any(Number) }])
    expect(await contar()).toBe(0)

    await aplicarBackfill(db, dryRun)
    expect(await contar()).toBe(1)
    const [fila] = await db.select().from(infraAfectacionCarrera).where(eq(infraAfectacionCarrera.afectacionId, 'af-acento'))
    expect(fila).toMatchObject({ matriculaCorteId: corteId })

    const segunda = planificarBackfill(await leerEntrada(db))
    expect(segunda.filas).toEqual([])
    expect(segunda.resumen.yaMigradas).toBe(1)
    await aplicarBackfill(db, segunda)
    expect(await contar()).toBe(1)
  })
})
