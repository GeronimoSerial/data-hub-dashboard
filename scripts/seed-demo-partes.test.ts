import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const SCRIPT = join(process.cwd(), 'scripts/seed-demo-partes.mjs')
const URL_PRODUCCION = 'postgres://demo:demo@127.0.0.1:1/hub_prod'

// Entorno base sin las variables de guardia heredadas del proceso de test:
// cada caso declara explícitamente lo que necesita.
function entornoBase(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.CONFIRMAR_SEED_PRODUCCION
  return { ...env, ...extra }
}

describe('seed-demo-partes sin padrón', () => {
  it('siembra 80 escuelas sin alcance nominal y las devuelve en el mapa con PGlite', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-partes-'))
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [SCRIPT, '--escuelas', '80', '--sin-padron'],
        { env: entornoBase({ DATA_DIR: dataDir, DEMO_OK: '1', DATABASE_URL: '', NODE_ENV: 'development' }), timeout: 30_000 },
      )
      expect(stdout).toContain('Modo sin padrón: partes sin secciones ni alumnos nominales.')
      expect(stdout).toMatch(/Total de partes devueltos: (8[0-9]|[1-9][0-9]{2,})/)
      expect(stdout).toMatch(/normal=\d+, parcial=[1-9]\d*, suspendido=[1-9]\d*/)
      expect(stdout).toMatch(/"seccionesAlcanzadas":\s*0/)
      expect(stdout).toMatch(/"alumnosAlcanzados":\s*0/)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  }, 40_000)
})

describe('seed-demo-partes guardia de producción', () => {
  it('rechaza NODE_ENV=production sin escribir nada', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-prod-'))
    try {
      const resultado = spawnSync(process.execPath, [SCRIPT, '--escuelas', '5', '--sin-padron'], {
        env: entornoBase({ DATA_DIR: dataDir, DEMO_OK: '1', DATABASE_URL: '', NODE_ENV: 'production' }),
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(resultado.status).toBe(1)
      expect(resultado.stderr).toContain('producción')
      expect(resultado.stdout).toBe('')
      expect(existsSync(join(dataDir, 'pg'))).toBe(false)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('rechaza una DATABASE_URL cuyo nombre de base parece de producción, sin mostrar la URL', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-prod-url-'))
    try {
      const resultado = spawnSync(process.execPath, [SCRIPT, '--escuelas', '5', '--sin-padron'], {
        env: entornoBase({ DATA_DIR: dataDir, DEMO_OK: '1', DATABASE_URL: URL_PRODUCCION, NODE_ENV: 'development' }),
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(resultado.status).toBe(1)
      expect(resultado.stderr).toContain('producción')
      expect(resultado.stderr).not.toContain(URL_PRODUCCION)
      expect(resultado.stdout).toBe('')
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('rechaza con sólo el flag --permitir-produccion (falta la confirmación por env)', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-prod-flag-'))
    try {
      const resultado = spawnSync(
        process.execPath,
        [SCRIPT, '--escuelas', '5', '--sin-padron', '--permitir-produccion'],
        {
          env: entornoBase({ DATA_DIR: dataDir, DEMO_OK: '1', DATABASE_URL: '', NODE_ENV: 'production' }),
          encoding: 'utf8',
          timeout: 30_000,
        },
      )
      expect(resultado.status).toBe(1)
      expect(resultado.stderr).toContain('CONFIRMAR_SEED_PRODUCCION')
      expect(existsSync(join(dataDir, 'pg'))).toBe(false)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('rechaza con sólo CONFIRMAR_SEED_PRODUCCION=si (falta el flag)', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-prod-env-'))
    try {
      const resultado = spawnSync(process.execPath, [SCRIPT, '--escuelas', '5', '--sin-padron'], {
        env: entornoBase({
          DATA_DIR: dataDir,
          DEMO_OK: '1',
          DATABASE_URL: '',
          NODE_ENV: 'production',
          CONFIRMAR_SEED_PRODUCCION: 'si',
        }),
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(resultado.status).toBe(1)
      expect(resultado.stderr).toContain('--permitir-produccion')
      expect(existsSync(join(dataDir, 'pg'))).toBe(false)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('permite producción sólo con ambos factores (flag y CONFIRMAR_SEED_PRODUCCION=si)', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-prod-ok-'))
    try {
      const resultado = spawnSync(
        process.execPath,
        [SCRIPT, '--escuelas', '80', '--sin-padron', '--permitir-produccion'],
        {
          env: entornoBase({
            DATA_DIR: dataDir,
            DEMO_OK: '1',
            DATABASE_URL: '',
            NODE_ENV: 'production',
            CONFIRMAR_SEED_PRODUCCION: 'si',
          }),
          encoding: 'utf8',
          timeout: 40_000,
        },
      )
      expect(resultado.status).toBe(0)
      expect(resultado.stdout).toContain('Modo sin padrón: partes sin secciones ni alumnos nominales.')
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  }, 60_000)
})
