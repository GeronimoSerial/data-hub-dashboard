import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RegionConfig } from '../lib/infraestructura/region/esquema'
import { cargarRegion } from '../lib/infraestructura/region/registro'
import { aplicaJobARegionDespacho } from './jobs.mjs'

const RAIZ = join(import.meta.dirname, '..')
const corrientes = cargarRegion('corrientes')
const manaos = cargarRegion('manaos')
const conSmnEInmet: RegionConfig = { ...manaos, id: 'prueba-smn-inmet', fuentesAlertas: ['smn', 'inmet'] }
const sinAlertas = { ...manaos, id: 'prueba-sin-alertas', fuentesAlertas: undefined } as unknown as RegionConfig

let dirFixture: string

beforeAll(() => {
  // Copia de los JSON reales: el despachador lee el JSON crudo, sin zod.
  dirFixture = mkdtempSync(join(tmpdir(), 'enos-inmet-despacho-'))
  writeFileSync(join(dirFixture, 'manaos.json'), readFileSync(join(RAIZ, 'config/regiones/manaos.json'), 'utf8'))
  writeFileSync(join(dirFixture, 'corrientes.json'), readFileSync(join(RAIZ, 'config/regiones/corrientes.json'), 'utf8'))
})

afterAll(() => {
  rmSync(dirFixture, { recursive: true, force: true })
})

function despachar(nombre: string, region: string) {
  // ENOS_JOBS_ENABLED=false: si la regla dejara pasar el job, sale sin tocar la base.
  return spawnSync(process.execPath, ['scripts/jobs.mjs', nombre], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, REGION: region, ENOS_REGION_CONFIG_DIR: dirFixture, ENOS_JOBS_ENABLED: 'false' },
  })
}

describe('aplicaJobARegionDespacho: avisos INMET', () => {
  it('Manaos (fuentesAlertas inmet) aplica sync-inmet-alertas', () => {
    expect(aplicaJobARegionDespacho('sync-inmet-alertas', manaos)).toBe(true)
  })

  it('Corrientes (fuentesAlertas smn) no aplica sync-inmet-alertas', () => {
    expect(aplicaJobARegionDespacho('sync-inmet-alertas', corrientes)).toBe(false)
  })

  it('fuentesAlertas smn e inmet aplican sync-inmet-alertas y sync-smn-alertas', () => {
    expect(aplicaJobARegionDespacho('sync-inmet-alertas', conSmnEInmet)).toBe(true)
    expect(aplicaJobARegionDespacho('sync-smn-alertas', conSmnEInmet)).toBe(true)
  })

  it('sin fuentesAlertas no aplica ni smn ni inmet', () => {
    expect(aplicaJobARegionDespacho('sync-inmet-alertas', sinAlertas)).toBe(false)
    expect(aplicaJobARegionDespacho('sync-smn-alertas', sinAlertas)).toBe(false)
  })
})

describe('scripts/jobs.mjs: rechazo por región de sync-inmet-alertas', () => {
  it('rechaza sync-inmet-alertas en Corrientes con código 2 y mensaje claro, sin ejecutar', () => {
    const resultado = despachar('sync-inmet-alertas', 'corrientes')
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('job sync-inmet-alertas does not apply to region corrientes')
    expect(resultado.stdout).toBe('')
  })

  it('acepta sync-inmet-alertas en Manaos (sale por flag, sin ejecutar)', () => {
    const resultado = despachar('sync-inmet-alertas', 'manaos')
    expect(resultado.status).toBe(0)
    expect(JSON.parse(resultado.stdout)).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
  })
})
