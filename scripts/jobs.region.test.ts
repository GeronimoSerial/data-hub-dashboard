import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aplicaJobARegion, JOBS_ESPERADOS_PRODUCTOR } from '../lib/infraestructura/riesgo/jobs-esperados'
import type { RegionConfig } from '../lib/infraestructura/region/esquema'
import { cargarRegion } from '../lib/infraestructura/region/registro'
import { aplicaJobARegionDespacho } from './jobs.mjs'

const RAIZ = join(import.meta.dirname, '..')
const corrientes = cargarRegion('corrientes')
const sinPrefectura: RegionConfig = { ...corrientes, id: 'manaos', fuentesRio: ['ana', 'sgb'] }

let dirFixture: string

beforeAll(() => {
  dirFixture = mkdtempSync(join(tmpdir(), 'enos-regiones-'))
  writeFileSync(join(dirFixture, 'manaos.json'), JSON.stringify(sinPrefectura))
})

afterAll(() => {
  rmSync(dirFixture, { recursive: true, force: true })
})

function despachar(nombre: string) {
  return spawnSync(process.execPath, ['scripts/jobs.mjs', nombre], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: { ...process.env, REGION: 'manaos', ENOS_REGION_CONFIG_DIR: dirFixture },
  })
}

describe('scripts/jobs.mjs: job que no aplica a la región activa', () => {
  it('rechaza sync-prefectura-alturas con código 2 y mensaje claro, sin tocar la base', () => {
    const resultado = despachar('sync-prefectura-alturas')
    expect(resultado.status).toBe(2)
    expect(resultado.stderr).toContain('job sync-prefectura-alturas does not apply to region manaos')
    expect(resultado.stdout).toBe('')
  })

  it('la regla del despachador coincide con la de jobs-esperados para todos los jobs y regiones de prueba', () => {
    const regiones = [corrientes, sinPrefectura, { ...corrientes, id: 'solo-ina', fuentesRio: ['ina'] }]
    for (const region of regiones) {
      for (const job of JOBS_ESPERADOS_PRODUCTOR) {
        expect(aplicaJobARegionDespacho(job.nombre, region), `${job.nombre} en ${region.id}`).toBe(
          aplicaJobARegion(job.nombre, region),
        )
      }
    }
  })
})
