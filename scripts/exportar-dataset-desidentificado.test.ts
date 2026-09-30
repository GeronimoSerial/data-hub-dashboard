import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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
    const salida = JSON.parse(resultado.salida) as {
      archivo: string
      filas: number
      advertencia: string
    }

    expect(salida.archivo).toContain(path.join(dataDir, 'dataset-replay-e7b'))
    expect(salida.filas).toBe(0)
    expect(salida.advertencia).toBe(
      'sin filas: el módulo de dataset aún no tiene un constructor de filas desde la base',
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
    expect(JSON.parse(resultado.salida).archivo).toBe(ruta)
    expect(readFileSync(ruta, 'utf8')).toContain('idEscuela,instante')
  })
})
