import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('seed-demo-partes sin padrón', () => {
  it('siembra 80 escuelas sin alcance nominal y las devuelve en el mapa con PGlite', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-demo-partes-'))
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [join(process.cwd(), 'scripts/seed-demo-partes.mjs'), '--escuelas', '80', '--sin-padron'],
        { env: { ...process.env, DATA_DIR: dataDir, DEMO_OK: '1', DATABASE_URL: '' }, timeout: 30_000 },
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
