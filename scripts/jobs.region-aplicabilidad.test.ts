import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aplicaJobARegion, JOBS_ESPERADOS_PRODUCTOR } from '../lib/infraestructura/riesgo/jobs-esperados'
import type { RegionConfig } from '../lib/infraestructura/region/esquema'
import { cargarRegion } from '../lib/infraestructura/region/registro'
import { aplicaJobARegionDespacho } from './jobs.mjs'

const RAIZ = join(import.meta.dirname, '..')
const corrientes = cargarRegion('corrientes')
const manaos = cargarRegion('manaos')
// Jobs that do not apply to Manaos. importar-exposicion-rio-dem is Manaos-enabled (FABDEM layer).
const JOBS_SOLO_CORRIENTES = ['sync-smn-alertas', 'sync-synop-lluvia']
const JOB_CAPA_DEM = 'importar-exposicion-rio-dem'
const JOBS_EXCLUSIVOS = [...JOBS_SOLO_CORRIENTES, JOB_CAPA_DEM]

let dirFixture: string

beforeAll(() => {
  // Copia del manaos.json real: el despachador lee el JSON crudo, sin zod.
  dirFixture = mkdtempSync(join(tmpdir(), 'enos-regiones-aplicabilidad-'))
  writeFileSync(join(dirFixture, 'manaos.json'), readFileSync(join(RAIZ, 'config/regiones/manaos.json'), 'utf8'))
})

afterAll(() => {
  rmSync(dirFixture, { recursive: true, force: true })
})

function despachar(nombre: string) {
  // ENOS_JOBS_ENABLED=false: si la regla dejara pasar el job, sale sin tocar la base.
  return spawnSync(process.execPath, ['scripts/jobs.mjs', nombre], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, REGION: 'manaos', ENOS_REGION_CONFIG_DIR: dirFixture, ENOS_JOBS_ENABLED: 'false' },
  })
}

describe('scripts/jobs.mjs: jobs exclusivos de Corrientes en Manaos', () => {
  for (const nombre of JOBS_SOLO_CORRIENTES) {
    it(`rechaza ${nombre} con código 2 y mensaje claro, sin ejecutar`, () => {
      const resultado = despachar(nombre)
      expect(resultado.status).toBe(2)
      expect(resultado.stderr).toContain(`job ${nombre} does not apply to region manaos`)
      expect(resultado.stdout).toBe('')
    })
  }

  it(`despacha ${JOB_CAPA_DEM} en Manaos: pasa la regla y sale por el flag, sin código 2`, () => {
    const resultado = despachar(JOB_CAPA_DEM)
    expect(resultado.status).toBe(0)
    expect(resultado.stderr).not.toContain('does not apply to region')
    expect(resultado.stderr).toContain(`"${JOB_CAPA_DEM}" no ejecutado: ENOS_JOBS_ENABLED=false`)
    expect(JSON.parse(resultado.stdout)).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
  })
})

describe('réplica del despachador frente a aplicaJobARegion', () => {
  const regiones: RegionConfig[] = [
    corrientes,
    manaos,
    { ...manaos, fuentesAlertas: ['inmet', 'smn'] },
    { ...manaos, fuentesLluvia: ['synop'] },
    { ...manaos, capasEstaticas: ['exposicion-rio-dem'] },
  ]

  it('coincide para todos los jobs y regiones de prueba', () => {
    for (const region of regiones) {
      for (const job of JOBS_ESPERADOS_PRODUCTOR) {
        expect(aplicaJobARegionDespacho(job.nombre, region), `${job.nombre} en ${region.id}`).toBe(
          aplicaJobARegion(job.nombre, region),
        )
      }
    }
  })

  it('Corrientes aplica los tres jobs exclusivos', () => {
    for (const nombre of JOBS_EXCLUSIVOS) {
      expect(aplicaJobARegionDespacho(nombre, corrientes), nombre).toBe(true)
    }
  })
})
