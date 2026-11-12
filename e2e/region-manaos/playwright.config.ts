import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Paths resolve against this file's directory (CJS: the project has no "type": "module").
const here = __dirname

// run.mjs starts the containers and passes their URLs and the admin credentials through the environment.
function requerir(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`${nombre} is required. Run the proof through e2e/region-manaos/run.mjs`)
  return valor
}

const manaosURL = requerir('REGION_PROOF_MANAOS_URL')
const corrientesURL = requerir('REGION_PROOF_CORRIENTES_URL')
// Screenshots and failure artifacts stay outside the repository.
const shots = process.env.REGION_PROOF_SHOTS ?? path.join(os.tmpdir(), 'region-proof-manual')

export default defineConfig({
  testDir: here,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: path.join(shots, 'artifacts'),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'manaos',
      testMatch: 'specs/manaos.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: manaosURL },
    },
    {
      name: 'corrientes-vacio',
      testMatch: 'specs/corrientes-vacio.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: corrientesURL },
    },
  ],
})
