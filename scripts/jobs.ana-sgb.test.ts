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
const soloAna: RegionConfig = { ...manaos, id: 'prueba-solo-ana', fuentesRio: ['ana'] }
const soloSgb: RegionConfig = { ...manaos, id: 'prueba-solo-sgb', fuentesRio: ['sgb'] }

let dirFixture: string

beforeAll(() => {
  // Copia de los JSON reales: el despachador lee el JSON crudo, sin zod.
  dirFixture = mkdtempSync(join(tmpdir(), 'enos-ana-sgb-despacho-'))
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

describe('aplicaJobARegionDespacho: niveles del río ANA y SGB', () => {
  it('Corrientes no aplica ninguno de los dos', () => {
    expect(aplicaJobARegionDespacho('sync-ana-niveis', corrientes)).toBe(false)
    expect(aplicaJobARegionDespacho('sync-sgb-niveis', corrientes)).toBe(false)
  })

  it('Manaos aplica los dos', () => {
    expect(aplicaJobARegionDespacho('sync-ana-niveis', manaos)).toBe(true)
    expect(aplicaJobARegionDespacho('sync-sgb-niveis', manaos)).toBe(true)
  })

  it('fuentesRio solo con ana aplica sólo sync-ana-niveis', () => {
    expect(aplicaJobARegionDespacho('sync-ana-niveis', soloAna)).toBe(true)
    expect(aplicaJobARegionDespacho('sync-sgb-niveis', soloAna)).toBe(false)
  })

  it('fuentesRio solo con sgb aplica sólo sync-sgb-niveis', () => {
    expect(aplicaJobARegionDespacho('sync-ana-niveis', soloSgb)).toBe(false)
    expect(aplicaJobARegionDespacho('sync-sgb-niveis', soloSgb)).toBe(true)
  })
})

describe('scripts/jobs.mjs: rechazo por región', () => {
  it('rechaza sync-ana-niveis en Corrientes con código 2 y mensaje claro, sin ejecutar', () => {
    const resultado = despachar('sync-ana-niveis', 'corrientes')
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('job sync-ana-niveis does not apply to region corrientes')
    expect(resultado.stdout).toBe('')
  })

  it('rechaza sync-sgb-niveis en Corrientes con código 2 y mensaje claro, sin ejecutar', () => {
    const resultado = despachar('sync-sgb-niveis', 'corrientes')
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('job sync-sgb-niveis does not apply to region corrientes')
    expect(resultado.stdout).toBe('')
  })

  it('acepta sync-ana-niveis en Manaos (sale por flag, sin ejecutar)', () => {
    const resultado = despachar('sync-ana-niveis', 'manaos')
    expect(resultado.status).toBe(0)
    expect(JSON.parse(resultado.stdout)).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
  })
})
