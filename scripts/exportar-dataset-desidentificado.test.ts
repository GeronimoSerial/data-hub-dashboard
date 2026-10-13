import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { getDb as GetDb } from '@/lib/db'
import {
  infraAfectacion,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  filasACsv,
  hashCueAnexo,
  type FilaDataset,
} from '@/lib/infraestructura/dataset/export-desidentificado'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { construirFilasDataset } from './exportar-dataset-desidentificado.mjs'

usarDbTemporal('export-dataset-consulta-')

let db: ReturnType<typeof GetDb>

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()
})

const directorios: string[] = []

afterEach(() => {
  for (const directorio of directorios.splice(0)) {
    rmSync(directorio, { recursive: true, force: true })
  }
})

function crearDataDir() {
  const directorio = mkdtempSync(path.join(tmpdir(), 'export-dataset-e7b-'))
  directorios.push(directorio)
  return directorio
}

// El resultado JSON es la última línea de stdout; antes puede haber logs de
// siembra de la base temporal (`ensureSeeded`) en una primera ejecución.
function resultadoJson(salida: string): Record<string, unknown> {
  const lineas = salida.split('\n').filter((linea) => linea.trim().length > 0)
  return JSON.parse(lineas[lineas.length - 1] ?? '') as Record<string, unknown>
}

function ejecutar(dataDir: string, sal?: string, args: string[] = []) {
  const entorno: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: dataDir }
  delete entorno.DATASET_SALT_E7B
  if (sal !== undefined) entorno.DATASET_SALT_E7B = sal
  const resultado = spawnSync(
    process.execPath,
    ['scripts/exportar-dataset-desidentificado.mjs', ...args],
    { cwd: process.cwd(), env: entorno, encoding: 'utf8' },
  )
  return { codigo: resultado.status, salida: resultado.stdout, error: resultado.stderr }
}

describe('scripts/exportar-dataset-desidentificado.mjs', () => {
  it('falla claramente y sin stack trace si DATASET_SALT_E7B no está configurada', () => {
    const resultado = ejecutar(crearDataDir())

    expect(resultado.codigo).toBe(1)
    expect(resultado.error).toContain('DATASET_SALT_E7B no está configurada')
    expect(resultado.error).not.toContain(' at ')
  })

  it('escribe el CSV con sal dentro del DATA_DIR temporal', () => {
    const dataDir = crearDataDir()
    const resultado = ejecutar(dataDir, 'test-salt')
    expect(resultado.codigo).toBe(0)
    const salida = resultadoJson(resultado.salida) as {
      archivo: string
      filas: number
      advertencia: string
    }

    expect(salida.archivo).toContain(path.join(dataDir, 'dataset-replay-e7b'))
    expect(salida.filas).toBe(0)
    expect(salida.advertencia).toBe(
      'sin filas: no hay snapshots de riesgo publicados en la base para exportar',
    )
    expect(resultado.error).toContain(salida.advertencia)
    const csv = readFileSync(salida.archivo, 'utf8')
    expect(csv).toContain('idEscuela,instante')
    expect(csv).not.toContain('1000000-01')
  })

  it('acepta --out para elegir la ruta del archivo', () => {
    const dataDir = crearDataDir()
    const ruta = path.join(dataDir, 'salida', 'dataset.csv')
    const resultado = ejecutar(dataDir, 'test-salt', ['--out', ruta])

    expect(resultado.codigo).toBe(0)
    expect(resultadoJson(resultado.salida).archivo).toBe(ruta)
    expect(readFileSync(ruta, 'utf8')).toContain('idEscuela,instante')
  })
})

const SAL_CONSULTA = 'sal-consulta-e7b'
const CUE_A = '1800001-00'
const CUE_B = '1800002-00'
const CUE_NO_PUBLICADO = '1800003-00'
const RUN_ID = 'run-e7b-publicado'
const RUN_NO_PUBLICADO_ID = 'run-e7b-borrador'
const T = '2026-09-27T10:00:00.000Z'
const AHORA = new Date('2026-10-13T00:00:00.000Z')
const COLUMNAS_DATASET = [
  'idEscuela',
  'instante',
  'nivelRiesgo',
  'horizonteHoras',
  'nivelPeligroDepartamento',
  'lluviaObservadaMm',
  'afectacionConfirmadaEnT',
  'targetAfectacion24h',
  'targetAfectacion72h',
]

async function limpiarConsulta(): Promise<void> {
  await db.delete(infraSituacionCorte)
  await db.delete(infraRiskSnapshot)
  await db.delete(infraRiskRun)
  await db.delete(infraAfectacion)
  await db.delete(infraParte)
}

async function sembrarSnapshots(): Promise<void> {
  await db.insert(infraRiskRun).values([
    {
      id: RUN_ID,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: T,
      publicadoEn: '2026-09-27T10:05:00.000Z',
      estado: 'vigente',
      cobertura: null,
      creadaEn: T,
    },
    {
      id: RUN_NO_PUBLICADO_ID,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: T,
      publicadoEn: null,
      estado: 'preparando',
      cobertura: null,
      creadaEn: T,
    },
  ])
  const snapshot = (runId: string, cueAnexo: string, horizonteHoras: 24 | 72, nivelRiesgo: string | null) => ({
    id: randomUUID(),
    runId,
    cueAnexo,
    horizonteHoras,
    evidenciaValida: nivelRiesgo !== null,
    scoreRiesgo: null,
    nivelRiesgo,
    scoreAmenaza: null,
    scoreVulnerabilidad: null,
    confianza: 'media',
    exposicionMatricula: null,
    exposicionSecciones: null,
    calculadoEn: T,
    validoHasta: '2026-09-28T10:00:00.000Z',
  })
  await db.insert(infraRiskSnapshot).values([
    snapshot(RUN_ID, CUE_A, 24, 'alto'),
    snapshot(RUN_ID, CUE_A, 72, 'moderado'),
    snapshot(RUN_ID, CUE_B, 24, 'bajo'),
    snapshot(RUN_NO_PUBLICADO_ID, CUE_NO_PUBLICADO, 24, 'muy_alto'),
  ])
}

async function registrarAfectacion(cueAnexo: string, creadaEn: string): Promise<void> {
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: creadaEn,
    corteId: 1,
    creadaEn,
    actualizadaEn: creadaEn,
  })
  await db.insert(infraAfectacion).values({
    id: randomUUID(),
    parteId,
    motivo: 'inundacion',
    categoria: 'establecimiento',
    severidad: 'alta',
    rigeDesde: creadaEn,
    creadaEn,
    retiradaEn: null,
  })
}

function filaDe(filas: FilaDataset[], cueAnexo: string, horizonteHoras: number): FilaDataset {
  const id = hashCueAnexo(cueAnexo, SAL_CONSULTA)
  const fila = filas.find((f) => f.idEscuela === id && f.horizonteHoras === horizonteHoras)
  if (!fila) throw new Error(`sin fila para ${cueAnexo} a ${horizonteHoras}h`)
  return fila
}

describe('construirFilasDataset (consulta desde la base)', () => {
  it('sin reportes: exporta una fila por snapshot publicado con targets en false, sin PII', async () => {
    await limpiarConsulta()
    await sembrarSnapshots()

    const filas = await construirFilasDataset({ db, sal: SAL_CONSULTA, ahora: AHORA })

    expect(filas).toHaveLength(3)
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...COLUMNAS_DATASET].sort())
      expect(fila.afectacionConfirmadaEnT).toBe(false)
      expect(fila.targetAfectacion24h).toBe(false)
      expect(fila.targetAfectacion72h).toBe(false)
      expect(fila.nivelPeligroDepartamento).toBeNull()
      expect(fila.lluviaObservadaMm).toBeNull()
    }
    expect(filaDe(filas, CUE_A, 24).nivelRiesgo).toBe('alto')
    expect(filaDe(filas, CUE_A, 72).nivelRiesgo).toBe('moderado')
    expect(filaDe(filas, CUE_B, 24).nivelRiesgo).toBe('bajo')

    const csv = filasACsv(filas)
    expect(csv.split('\n')[0]).toBe(COLUMNAS_DATASET.join(','))
    expect(csv).not.toContain(CUE_A)
    expect(csv).not.toContain(CUE_B)
    expect(csv).not.toContain(CUE_NO_PUBLICADO)
    expect(csv).not.toContain(hashCueAnexo(CUE_NO_PUBLICADO, SAL_CONSULTA))
  })

  it('con un reporte posterior a t: el target 24h/72h de esa escuela pasa a true, sin tocar a las demás', async () => {
    await limpiarConsulta()
    await sembrarSnapshots()
    await registrarAfectacion(CUE_A, '2026-09-27T16:00:00.000Z')

    const filas = await construirFilasDataset({ db, sal: SAL_CONSULTA, ahora: AHORA })

    expect(filaDe(filas, CUE_A, 24).targetAfectacion24h).toBe(true)
    expect(filaDe(filas, CUE_A, 72).targetAfectacion72h).toBe(true)
    expect(filaDe(filas, CUE_A, 24).afectacionConfirmadaEnT).toBe(false)
    expect(filaDe(filas, CUE_B, 24).targetAfectacion24h).toBe(false)
  })

  it('un reporte registrado antes de t cuenta como afectación confirmada en t, no como target', async () => {
    await limpiarConsulta()
    await sembrarSnapshots()
    await registrarAfectacion(CUE_B, '2026-09-27T08:00:00.000Z')

    const filas = await construirFilasDataset({ db, sal: SAL_CONSULTA, ahora: AHORA })

    expect(filaDe(filas, CUE_B, 24).afectacionConfirmadaEnT).toBe(true)
    expect(filaDe(filas, CUE_B, 24).targetAfectacion24h).toBe(false)
  })

  it('target no evaluable (null) cuando la ventana aún no llega al corte', async () => {
    await limpiarConsulta()
    await sembrarSnapshots()

    // Corte a t+30h: la ventana de 24h ya está cubierta, la de 72h no.
    const filas = await construirFilasDataset({
      db,
      sal: SAL_CONSULTA,
      ahora: new Date('2026-09-28T16:00:00.000Z'),
    })

    expect(filaDe(filas, CUE_A, 24).targetAfectacion24h).toBe(false)
    expect(filaDe(filas, CUE_A, 24).targetAfectacion72h).toBeNull()
  })
})
