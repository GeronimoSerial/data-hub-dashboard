import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { infraDatasetVersion } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { leerCargaDatasets, publicarDatasets } from './region-cargar.mjs'

const RAIZ = join(import.meta.dirname, '..')
const CLAVE = 'prueba-region-cargar'
const SIN_DATABASE_URL = 'postgres://127.0.0.1:1/no-existe'

let dirFixture: string
let archivoDatos: string
let archivoOtrosDatos: string

usarDbTemporal('region-cargar', { seed: false })

function entrada(datasetId: string, datos: unknown) {
  return { datasetId, nombre: 'Prueba de carga por región', revision: 'v1', fuente: 'fuente pública de prueba',
    formato: 'array', clave: 'id', datos }
}

function escribirRegion(id: string, extra: Record<string, unknown>) {
  writeFileSync(join(dirFixture, `${id}.json`), JSON.stringify({ id, ...extra }))
}

beforeAll(async () => {
  await migrarDb()
  dirFixture = mkdtempSync(join(tmpdir(), 'enos-region-cargar-'))
  archivoDatos = join(dirFixture, 'datos.json')
  archivoOtrosDatos = join(dirFixture, 'otros-datos.json')
  writeFileSync(archivoDatos, JSON.stringify(entrada(CLAVE, [{ id: 'uno', valor: 1 }])))
  writeFileSync(archivoOtrosDatos, JSON.stringify(entrada(CLAVE, [{ id: 'uno', valor: 2 }])))
  escribirRegion('sin-datos', { datasetsPendientes: ['municipios-x', 'padron-y'] })
  escribirRegion('sin-datos-ni-pendientes', {})
  escribirRegion('con-datos', { cargaDatasets: [{ clave: CLAVE, archivo: archivoDatos }] })
  escribirRegion('clave-no-coincide', { cargaDatasets: [{ clave: 'otra-clave', archivo: archivoDatos }] })
  escribirRegion('clave-invalida', { cargaDatasets: [{ clave: 'Mayusculas', archivo: archivoDatos }] })
  escribirRegion('archivo-ausente', { cargaDatasets: [{ clave: CLAVE, archivo: join(dirFixture, 'no-existe.json') }] })
})

afterAll(() => {
  rmSync(dirFixture, { recursive: true, force: true })
})

function correr(args: string[], databaseUrl?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, ENOS_REGION_CONFIG_DIR: dirFixture }
  delete env.DATABASE_URL
  if (databaseUrl) env.DATABASE_URL = databaseUrl
  return spawnSync(process.execPath, ['scripts/region-cargar.mjs', ...args], { cwd: RAIZ, encoding: 'utf8', env })
}

describe('pnpm region:cargar: uso y configuración', () => {
  it('sin argumentos sale con código 2 y muestra el uso', () => {
    const resultado = correr([])
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('Uso: pnpm region:cargar <id>')
    expect(resultado.stdout).toBe('')
  })

  it('una región desconocida sale con código 2 sin tocar la base', () => {
    const resultado = correr(['no-existe'], SIN_DATABASE_URL)
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('región desconocida: "no-existe"')
  })

  it('una región sin datasets declarados sale con código 0 y lo informa sin DB', () => {
    const resultado = correr(['sin-datos'], SIN_DATABASE_URL)
    expect(resultado.status).toBe(0)
    expect(resultado.stdout.trim()).toBe('region sin-datos: no datasets declared (pending: municipios-x, padron-y)')
  })

  it('sin datasets ni pendientes informa "pending: none"', () => {
    const resultado = correr(['sin-datos-ni-pendientes'])
    expect(resultado.status).toBe(0)
    expect(resultado.stdout.trim()).toBe('region sin-datos-ni-pendientes: no datasets declared (pending: none)')
  })

  it('Corrientes no declara datasets y no toca la base', () => {
    const resultado = spawnSync(process.execPath, ['scripts/region-cargar.mjs', 'corrientes'], {
      cwd: RAIZ, encoding: 'utf8', env: { ...process.env, DATABASE_URL: SIN_DATABASE_URL },
    })
    expect(resultado.status).toBe(0)
    expect(resultado.stdout.trim()).toBe('region corrientes: no datasets declared (pending: none)')
  })

  it('rechaza cargaDatasets con clave inválida, clave que no coincide o archivo ausente, con código 2', () => {
    for (const region of ['clave-invalida', 'clave-no-coincide', 'archivo-ausente']) {
      const resultado = correr([region, '--dry-run'], SIN_DATABASE_URL)
      expect(resultado.status, region).toBe(2)
      expect(resultado.stderr, region).toContain('cargaDatasets')
    }
  })
})

describe('pnpm region:cargar: --dry-run y base', () => {
  it('--dry-run lista el dataset y su archivo sin escribir en la base', () => {
    const resultado = correr(['con-datos', '--dry-run'], SIN_DATABASE_URL)
    expect(resultado.status).toBe(0)
    expect(resultado.stdout).toContain(`dry-run: ${CLAVE} <- ${archivoDatos}`)
    expect(resultado.stdout).not.toContain('version')
  })

  it('sin DATABASE_URL y con datasets declarados sale con código 2', () => {
    const resultado = correr(['con-datos'])
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('DATABASE_URL')
  })
})

describe('publicarDatasets sobre la base temporal', () => {
  it('publicar dos veces el mismo contenido deja una sola versión; un contenido distinto crea otra', async () => {
    const declarados = leerCargaDatasets({ id: 'con-datos', cargaDatasets: [{ clave: CLAVE, archivo: archivoDatos }] })
    const primera = await publicarDatasets(declarados)
    const segunda = await publicarDatasets(declarados)
    expect(segunda[0].versionId).toBe(primera[0].versionId)

    const filas = await getDb().select({ id: infraDatasetVersion.id }).from(infraDatasetVersion)
      .where(eq(infraDatasetVersion.datasetId, CLAVE))
    expect(filas).toHaveLength(1)

    await publicarDatasets(leerCargaDatasets({ id: 'con-datos', cargaDatasets: [{ clave: CLAVE, archivo: archivoOtrosDatos }] }))
    const despues = await getDb().select({ id: infraDatasetVersion.id }).from(infraDatasetVersion)
      .where(eq(infraDatasetVersion.datasetId, CLAVE))
    expect(despues).toHaveLength(2)
  })
})
