import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  construirFilaDataset,
  escribirDatasetCsv,
  filasACsv,
  hashCueAnexo,
  resolverSalDataset,
  type EntradaTarget,
  type FilaDataset,
  type FilaFeatureEscuela,
} from './export-desidentificado'

const SAL = 'sal-de-test-e7b'

describe('hashCueAnexo', () => {
  it('es determinista para el mismo CUE y sal', () => {
    expect(hashCueAnexo('1000000-01', SAL)).toBe(hashCueAnexo('1000000-01', SAL))
  })

  it('nunca es igual al CUE en claro', () => {
    expect(hashCueAnexo('1000000-01', SAL)).not.toBe('1000000-01')
  })

  it('cambia con la sal (misma escuela, distinta sal)', () => {
    expect(hashCueAnexo('1000000-01', SAL)).not.toBe(hashCueAnexo('1000000-01', 'otra-sal'))
  })
})

const FEATURE_BASE: FilaFeatureEscuela = {
  cueAnexo: '1000000-01',
  instante: '2026-03-10T12:00:00.000Z',
  nivelRiesgo: 'alto',
  horizonteHoras: 72,
  nivelPeligroDepartamento: 'naranja',
  lluviaObservadaMm: 22.5,
  afectacionConfirmadaEnT: false,
}

const TARGET_BASE: EntradaTarget = {
  cueAnexo: '1000000-01',
  instante: '2026-03-10T12:00:00.000Z',
  afectacionConfirmadaEn24h: true,
  afectacionConfirmadaEn72h: null,
}

describe('construirFilaDataset', () => {
  it('arma la fila desidentificada uniendo feature + target', () => {
    const fila = construirFilaDataset(FEATURE_BASE, TARGET_BASE, SAL)
    expect(fila.idEscuela).toBe(hashCueAnexo('1000000-01', SAL))
    expect(fila).toMatchObject({
      instante: FEATURE_BASE.instante,
      nivelRiesgo: 'alto',
      nivelPeligroDepartamento: 'naranja',
      lluviaObservadaMm: 22.5,
      afectacionConfirmadaEnT: false,
      targetAfectacion24h: true,
      targetAfectacion72h: null, // "no evaluable" para 72h, preservado tal cual
    })
    expect((fila as unknown as { cueAnexo?: string }).cueAnexo).toBeUndefined()
  })

  it('rechaza unir feature y target de escuela-instante distintos', () => {
    expect(() =>
      construirFilaDataset(FEATURE_BASE, { ...TARGET_BASE, cueAnexo: '2000000-01' }, SAL),
    ).toThrow(/misma escuela-instante/)
  })
})

describe('filasACsv', () => {
  it('serializa null como celda vacía, nunca como texto "null" ni un valor inventado', () => {
    const filas: FilaDataset[] = [construirFilaDataset(FEATURE_BASE, TARGET_BASE, SAL)]
    const csv = filasACsv(filas)
    const lineas = csv.trim().split('\n')
    expect(lineas[0]).toBe(
      'idEscuela,instante,nivelRiesgo,horizonteHoras,nivelPeligroDepartamento,lluviaObservadaMm,afectacionConfirmadaEnT,targetAfectacion24h,targetAfectacion72h',
    )
    // Última columna (targetAfectacion72h) vacía porque es null.
    expect(lineas[1].endsWith(',true,')).toBe(true)
  })
})

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'dataset-e7b-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('escribirDatasetCsv', () => {
  it('escribe bajo DATA_DIR/dataset-replay-e7b/<version>_<fecha>.csv', () => {
    const filas: FilaDataset[] = [construirFilaDataset(FEATURE_BASE, TARGET_BASE, SAL)]
    const archivo = escribirDatasetCsv(filas, new Date('2026-03-10T00:00:00.000Z'))
    expect(archivo).toContain(path.join('dataset-replay-e7b'))
    expect(archivo.endsWith('2026-03-10.csv')).toBe(true)
    const contenido = readFileSync(archivo, 'utf8')
    expect(contenido).toBe(filasACsv(filas))
  })

  it('recorrer el mismo día dos veces sobrescribe, no duplica', () => {
    const filas1: FilaDataset[] = [construirFilaDataset(FEATURE_BASE, TARGET_BASE, SAL)]
    const filas2: FilaDataset[] = []
    const fecha = new Date('2026-03-10T00:00:00.000Z')
    const archivo1 = escribirDatasetCsv(filas1, fecha)
    const archivo2 = escribirDatasetCsv(filas2, fecha)
    expect(archivo1).toBe(archivo2)
    expect(readFileSync(archivo2, 'utf8')).toBe(filasACsv(filas2))
  })
})

describe('resolverSalDataset', () => {
  const PREV = process.env.DATASET_SALT_E7B

  afterEach(() => {
    if (PREV === undefined) delete process.env.DATASET_SALT_E7B
    else process.env.DATASET_SALT_E7B = PREV
  })

  it('lanza si DATASET_SALT_E7B no está configurada', () => {
    delete process.env.DATASET_SALT_E7B
    expect(() => resolverSalDataset()).toThrow(/DATASET_SALT_E7B/)
  })

  it('devuelve la sal cuando está configurada', () => {
    process.env.DATASET_SALT_E7B = 'una-sal-cualquiera'
    expect(resolverSalDataset()).toBe('una-sal-cualquiera')
  })
})
